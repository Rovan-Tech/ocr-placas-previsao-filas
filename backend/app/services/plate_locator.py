from itertools import pairwise

import cv2
import numpy as np

from app.services.plate_format import PLATE_LENGTH

MIN_PLATE_ASPECT_RATIO = 2.0
MAX_PLATE_ASPECT_RATIO = 6.5
MOTO_MIN_ASPECT_RATIO = 0.7
MOTO_MAX_ASPECT_RATIO = 1.9
MIN_PLATE_WIDTH_PX = 60
MIN_AREA_FRACTION = 0.001
MAX_AREA_FRACTION = 0.95

SEARCH_MAX_WIDTH = 1000
RECTIFIED_HEIGHT = 160
CROP_MARGIN_X = 0.14
CROP_MARGIN_Y = 0.3
WIDE_CROP_MARGIN_X = 0.6

CHAR_MIN_HEIGHT_FRACTION = 0.02
CHAR_MAX_HEIGHT_FRACTION = 0.35
CHAR_ASPECT_MIN = 0.15
CHAR_ASPECT_MAX = 1.4
MIN_CLUSTER_CHARACTERS = 4
BASELINE_TOLERANCE = 0.6
CHAR_HEIGHT_RATIO_MIN = 0.55
CHAR_HEIGHT_RATIO_MAX = 1.8
MAX_CHARACTER_GAP = 2.5

LINE_OVERLAP_FRACTION = 0.4
MIN_PATCH_SIDE_PX = 3
MIN_LINE_CLUSTER_CHARACTERS = 2
MIN_COMPONENT_AREA_PX = 5
QUAD_CORNERS = 4
MIN_TEXT_PATCH_WIDTH_PX = 8
MAX_OVERLAP_FRACTION = 0.6

_Rect = tuple[int, int, int, int]


def _order_corners(points: np.ndarray) -> np.ndarray:
    points = points.reshape(4, 2).astype(np.float32)
    center = points.mean(axis=0)
    angles = np.arctan2(points[:, 1] - center[1], points[:, 0] - center[0])
    ordered = points[np.argsort(angles)]
    start = np.argmin(ordered.sum(axis=1))
    return np.roll(ordered, -start, axis=0)


def _expand(corners: np.ndarray, margin_x: float, margin_y: float) -> np.ndarray:
    top_left, top_right, bottom_right, bottom_left = corners
    along_width = ((top_right - top_left) + (bottom_right - bottom_left)) / 2
    along_height = ((bottom_left - top_left) + (bottom_right - top_right)) / 2
    grow = along_width * margin_x / 2 + along_height * margin_y / 2
    grow_other = along_width * margin_x / 2 - along_height * margin_y / 2
    return np.array(
        [
            top_left - grow,
            top_right + grow_other,
            bottom_right + grow,
            bottom_left - grow_other,
        ],
        dtype=np.float32,
    )


def rectify(
    image: np.ndarray, corners: np.ndarray, height: int = RECTIFIED_HEIGHT
) -> np.ndarray:
    corners = _order_corners(corners)
    top = float(np.linalg.norm(corners[1] - corners[0]))
    bottom = float(np.linalg.norm(corners[2] - corners[3]))
    left = float(np.linalg.norm(corners[3] - corners[0]))
    right = float(np.linalg.norm(corners[2] - corners[1]))
    if max(top, bottom) < max(left, right):
        corners = np.roll(corners, 1, axis=0)
        top, bottom, left, right = left, right, top, bottom
    aspect_ratio = max(top, bottom) / max(left, right, 1.0)
    width = round(height * aspect_ratio)
    destination = np.array(
        [[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]],
        dtype=np.float32,
    )
    matrix = cv2.getPerspectiveTransform(corners, destination)
    return cv2.warpPerspective(
        image,
        matrix,
        (width, height),
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_REPLICATE,
    )


def _character_boxes(gray: np.ndarray) -> list[tuple[float, float, float, float]]:
    denoised = cv2.medianBlur(gray, 3)
    enhanced = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(denoised)
    blackhat = cv2.morphologyEx(
        enhanced, cv2.MORPH_BLACKHAT, cv2.getStructuringElement(cv2.MORPH_RECT, (9, 15))
    )
    _, mask = cv2.threshold(blackhat, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)
    mask = cv2.morphologyEx(
        mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    )
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    height = gray.shape[0]
    boxes = []
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        if (
            not CHAR_MIN_HEIGHT_FRACTION * height
            <= h
            <= CHAR_MAX_HEIGHT_FRACTION * height
        ):
            continue
        if not CHAR_ASPECT_MIN <= w / h <= CHAR_ASPECT_MAX:
            continue
        boxes.append((float(x), float(y), float(w), float(h)))
    return boxes


def _split_by_horizontal_gap(
    cluster: list[tuple[float, float, float, float]],
) -> list[list[tuple[float, float, float, float]]]:
    ordered = sorted(cluster, key=lambda b: b[0])
    median_width = float(np.median([b[2] for b in ordered]))
    segments = [[ordered[0]]]
    for previous, box in pairwise(ordered):
        gap = box[0] - (previous[0] + previous[2])
        if gap > MAX_CHARACTER_GAP * median_width:
            segments.append([])
        segments[-1].append(box)
    return segments


def _group_by_baseline(
    boxes: list[tuple[float, float, float, float]],
) -> list[list[tuple[float, float, float, float]]]:
    baseline_groups: list[list[tuple[float, float, float, float]]] = []
    for box in sorted(boxes, key=lambda b: b[1] + b[3] / 2):
        _, y, _, h = box
        center = y + h / 2
        for group in baseline_groups:
            reference_height = group[0][3]
            reference_center = group[0][1] + reference_height / 2
            if (
                abs(center - reference_center) <= BASELINE_TOLERANCE * reference_height
                and CHAR_HEIGHT_RATIO_MIN
                <= h / reference_height
                <= CHAR_HEIGHT_RATIO_MAX
            ):
                group.append(box)
                break
        else:
            baseline_groups.append([box])
    return baseline_groups


def _is_plausible_plate_ratio(ratio: float) -> bool:
    return (
        MIN_PLATE_ASPECT_RATIO <= ratio <= MAX_PLATE_ASPECT_RATIO
        or MOTO_MIN_ASPECT_RATIO <= ratio <= MOTO_MAX_ASPECT_RATIO
    )


def _bounding_box(
    boxes: list[tuple[float, float, float, float]],
) -> tuple[float, float, float, float]:
    x0 = min(b[0] for b in boxes)
    y0 = min(b[1] for b in boxes)
    x1 = max(b[0] + b[2] for b in boxes)
    y1 = max(b[1] + b[3] for b in boxes)
    return x0, y0, x1, y1


def _box_ratio(box: tuple[float, float, float, float]) -> float | None:
    x0, y0, x1, y1 = box
    height = y1 - y0
    return None if height == 0 else (x1 - x0) / height


def _corners_from_box(box: tuple[float, float, float, float]) -> np.ndarray:
    x0, y0, x1, y1 = box
    return np.array([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], dtype=np.float32)


def _lines_overlap_horizontally(
    first: list[tuple[float, float, float, float]],
    second: list[tuple[float, float, float, float]],
) -> bool:
    ax0, _, ax1, _ = _bounding_box(first)
    bx0, _, bx1, _ = _bounding_box(second)
    overlap = min(ax1, bx1) - max(ax0, bx0)
    return overlap > LINE_OVERLAP_FRACTION * min(ax1 - ax0, bx1 - bx0)


def _line_clusters(
    boxes: list[tuple[float, float, float, float]],
) -> list[list[tuple[float, float, float, float]]]:
    lines = []
    for group in _group_by_baseline(boxes):
        clusters = [
            cluster
            for cluster in _split_by_horizontal_gap(group)
            if len(cluster) >= MIN_LINE_CLUSTER_CHARACTERS
        ]
        if clusters:
            lines.append(max(clusters, key=len))
    return lines


def _dark_component_count(patch: np.ndarray) -> int:
    if patch.size == 0 or min(patch.shape[:2]) < MIN_PATCH_SIDE_PX:
        return 0
    denoised = cv2.medianBlur(patch, 3)
    enhanced = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(denoised)
    blackhat = cv2.morphologyEx(
        enhanced, cv2.MORPH_BLACKHAT, cv2.getStructuringElement(cv2.MORPH_RECT, (9, 15))
    )
    _, mask = cv2.threshold(blackhat, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)
    mask = cv2.morphologyEx(
        mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    )
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    return sum(
        1 for contour in contours if cv2.contourArea(contour) > MIN_COMPONENT_AREA_PX
    )


MIN_DARK_COMPONENTS_FOR_PLATE = 8


def _looks_like_plate_text(gray: np.ndarray, corners: np.ndarray) -> bool:
    x, y, w, h = cv2.boundingRect(corners.astype(np.float32))
    x, y = max(x, 0), max(y, 0)
    native_crop = gray[y : y + h, x : x + w]
    return _dark_component_count(native_crop) >= MIN_DARK_COMPONENTS_FOR_PLATE


def _cluster_characters_into_lines(
    boxes: list[tuple[float, float, float, float]],
) -> list[np.ndarray]:
    corners = []
    for group in _group_by_baseline(boxes):
        for cluster in _split_by_horizontal_gap(group):
            if len(cluster) < MIN_CLUSTER_CHARACTERS:
                continue
            ratio = _box_ratio(_bounding_box(cluster))
            if ratio is not None and _is_plausible_plate_ratio(ratio):
                corners.append(_corners_from_box(_bounding_box(cluster)))

    lines = _line_clusters(boxes)
    for first, second in pairwise(lines):
        if len(first) + len(second) < MIN_CLUSTER_CHARACTERS:
            continue
        if not _lines_overlap_horizontally(first, second):
            continue
        box = _bounding_box(first + second)
        ratio = _box_ratio(box)
        if ratio is not None and _is_plausible_plate_ratio(ratio):
            corners.append(_corners_from_box(box))

    return corners


def _best_character_run(boxes: list[tuple[float, float, float, float]]) -> int:
    lines = _line_clusters(boxes)
    best = max((len(line) for line in lines), default=0)
    for first, second in pairwise(lines):
        if _lines_overlap_horizontally(first, second):
            best = max(best, len(first) + len(second))
    return best


def _candidate_corners(gray: np.ndarray) -> list[tuple[np.ndarray, bool]]:
    image_area = gray.shape[0] * gray.shape[1]
    enhanced = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)

    edges = cv2.Canny(cv2.bilateralFilter(enhanced, 9, 50, 50), 40, 160)
    edges = cv2.dilate(edges, np.ones((3, 3), np.uint8))
    edge_contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

    blackhat = cv2.morphologyEx(
        enhanced, cv2.MORPH_BLACKHAT, cv2.getStructuringElement(cv2.MORPH_RECT, (25, 9))
    )
    gradient = np.absolute(cv2.Sobel(blackhat, cv2.CV_32F, 1, 0, ksize=3))
    gradient = cv2.normalize(
        gradient, np.empty_like(gradient), 0, 255, cv2.NORM_MINMAX
    ).astype(np.uint8)
    gradient = cv2.GaussianBlur(gradient, (7, 7), 0)
    _, text_mask = cv2.threshold(gradient, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)
    text_mask = cv2.morphologyEx(
        text_mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (31, 7))
    )
    text_mask = cv2.erode(text_mask, np.ones((3, 3), np.uint8), iterations=1)
    text_contours, _ = cv2.findContours(
        text_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )

    candidates = []
    sources = [(contour, True) for contour in edge_contours] + [
        (contour, False) for contour in text_contours
    ]
    for contour, is_plate_outline in sources:
        area = cv2.contourArea(contour)
        if not MIN_AREA_FRACTION * image_area <= area <= MAX_AREA_FRACTION * image_area:
            continue
        (_, _), (w, h), _ = cv2.minAreaRect(contour)
        long_side, short_side = max(w, h), min(w, h)
        if short_side == 0 or long_side < MIN_PLATE_WIDTH_PX / 2:
            continue
        ratio = long_side / short_side
        corners = cv2.boxPoints(cv2.minAreaRect(contour))
        approx = (
            cv2.approxPolyDP(
                cv2.convexHull(contour), 0.04 * cv2.arcLength(contour, True), True
            )
            if is_plate_outline
            else None
        )
        approx_ratio = None
        if approx is not None and len(approx) == QUAD_CORNERS:
            (_, _), (approx_w, approx_h), _ = cv2.minAreaRect(approx)
            if min(approx_w, approx_h) > 0:
                approx_ratio = max(approx_w, approx_h) / min(approx_w, approx_h)
        is_clean_quad = approx_ratio is not None and _is_plausible_plate_ratio(
            approx_ratio
        )
        if MIN_PLATE_ASPECT_RATIO <= ratio <= MAX_PLATE_ASPECT_RATIO or (
            MOTO_MIN_ASPECT_RATIO <= ratio <= MOTO_MAX_ASPECT_RATIO
            and _looks_like_plate_text(gray, _order_corners(corners))
        ):
            pass
        else:
            continue
        if is_clean_quad and approx is not None:
            corners = approx
        candidates.append((_order_corners(corners), False))

    candidates.extend(
        (corners, True)
        for corners in _cluster_characters_into_lines(_character_boxes(gray))
    )
    return candidates


def _character_count_bonus(gray: np.ndarray, corners: np.ndarray) -> float:
    patch = rectify(gray, corners, height=RECTIFIED_HEIGHT)
    run = _best_character_run(_character_boxes(patch))
    off_by = abs(run - PLATE_LENGTH)
    if off_by == 0:
        return 1.0
    if off_by == 1:
        return 0.4
    return 0.1


def _text_score(gray: np.ndarray, corners: np.ndarray) -> float:
    patch = rectify(gray, corners, height=48)
    if patch.shape[1] < MIN_TEXT_PATCH_WIDTH_PX:
        return 0.0
    vertical_edges = np.absolute(cv2.Sobel(patch, cv2.CV_32F, 1, 0, ksize=3)).mean()
    horizontal_edges = np.absolute(cv2.Sobel(patch, cv2.CV_32F, 0, 1, ksize=3)).mean()
    contrast = float(patch.std())
    base_score = float(vertical_edges / (horizontal_edges + 1.0)) * contrast
    return base_score * _character_count_bonus(gray, corners)


def _bounding_rect(corners: np.ndarray) -> _Rect:
    x, y, w, h = cv2.boundingRect(corners.astype(np.float32))
    return x, y, w, h


def _boxes(a: np.ndarray, b: np.ndarray) -> tuple[_Rect, _Rect]:
    return _bounding_rect(a), _bounding_rect(b)


def _intersection_area(a: np.ndarray, b: np.ndarray) -> float:
    (ax, ay, aw, ah), (bx, by, bw, bh) = _boxes(a, b)
    ix = max(0, min(ax + aw, bx + bw) - max(ax, bx))
    iy = max(0, min(ay + ah, by + bh) - max(ay, by))
    return ix * iy


def _overlap(a: np.ndarray, b: np.ndarray) -> float:
    (_, _, aw, ah), (_, _, bw, bh) = _boxes(a, b)
    return _intersection_area(a, b) / float(min(aw * ah, bw * bh) or 1)


def _covered_by(region: np.ndarray, other: np.ndarray) -> float:
    (_, _, rw, rh), _ = _boxes(region, other)
    return _intersection_area(region, other) / float(rw * rh or 1)


def _region_area(corners: np.ndarray) -> float:
    _, _, w, h = cv2.boundingRect(corners.astype(np.float32))
    return float(w * h)


def find_plate_candidates(
    image: np.ndarray, max_candidates: int = 3
) -> list[tuple[np.ndarray, bool]]:
    width = image.shape[1]
    scale = min(1.0, SEARCH_MAX_WIDTH / width)
    small = (
        cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        if scale < 1
        else image
    )
    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)

    corners_by_source = _candidate_corners(gray)
    non_cluster = [
        corners for corners, is_cluster in corners_by_source if not is_cluster
    ]
    clusters = [corners for corners, is_cluster in corners_by_source if is_cluster]

    scored = sorted(
        ((_text_score(gray, corners), corners) for corners in non_cluster),
        key=lambda item: item[0],
        reverse=True,
    )
    chosen: list[np.ndarray] = []
    chosen_is_weak: list[bool] = []
    for _, corners in scored:
        if all(_overlap(corners, other) < MAX_OVERLAP_FRACTION for other in chosen):
            chosen.append(corners)
            chosen_is_weak.append(False)
        if len(chosen) == max_candidates:
            break

    if clusters:
        best_cluster = max(clusters, key=lambda corners: _text_score(gray, corners))
        if not chosen or _covered_by(best_cluster, chosen[0]) < MAX_OVERLAP_FRACTION:
            index = 1 if chosen else 0
            chosen.insert(index, best_cluster)
            chosen_is_weak.insert(index, True)

    if non_cluster:
        largest = max(non_cluster, key=_region_area)
        if all(_covered_by(largest, other) < MAX_OVERLAP_FRACTION for other in chosen):
            chosen.append(largest)
            chosen_is_weak.append(False)

    crops = [
        (
            rectify(image, _expand(corners / scale, CROP_MARGIN_X, CROP_MARGIN_Y)),
            is_weak,
        )
        for corners, is_weak in zip(chosen, chosen_is_weak, strict=True)
    ]
    if chosen:
        wide = rectify(
            image, _expand(chosen[0] / scale, WIDE_CROP_MARGIN_X, CROP_MARGIN_Y)
        )
        crops.insert(1, (wide, chosen_is_weak[0]))
    return crops


def locate_plate(image: np.ndarray) -> np.ndarray:
    candidates = find_plate_candidates(image, max_candidates=1)
    return candidates[0][0] if candidates else image
