import cv2
import numpy as np

from app.services.plate_format import PLATE_LENGTH

MIN_PLATE_ASPECT_RATIO = 2.0
MAX_PLATE_ASPECT_RATIO = 6.5
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


def _order_corners(points: np.ndarray) -> np.ndarray:
    points = points.reshape(4, 2).astype(np.float32)
    by_sum = points.sum(axis=1)
    by_diff = np.diff(points, axis=1).ravel()
    return np.float32(
        [
            points[np.argmin(by_sum)],
            points[np.argmin(by_diff)],
            points[np.argmax(by_sum)],
            points[np.argmax(by_diff)],
        ]
    )


def _expand(corners: np.ndarray, margin_x: float, margin_y: float) -> np.ndarray:
    top_left, top_right, bottom_right, bottom_left = corners
    center = corners.mean(axis=0)
    along_width = ((top_right - top_left) + (bottom_right - bottom_left)) / 2
    along_height = ((bottom_left - top_left) + (bottom_right - top_right)) / 2
    grow = along_width * margin_x / 2 + along_height * margin_y / 2
    grow_other = along_width * margin_x / 2 - along_height * margin_y / 2
    return np.float32(
        [
            top_left - grow,
            top_right + grow_other,
            bottom_right + grow,
            bottom_left - grow_other,
        ]
    )


def rectify(image: np.ndarray, corners: np.ndarray, height: int = RECTIFIED_HEIGHT) -> np.ndarray:
    corners = _order_corners(corners)
    top = np.linalg.norm(corners[1] - corners[0])
    bottom = np.linalg.norm(corners[2] - corners[3])
    left = np.linalg.norm(corners[3] - corners[0])
    right = np.linalg.norm(corners[2] - corners[1])
    if max(top, bottom) < max(left, right):
        corners = np.roll(corners, 1, axis=0)
        top, bottom, left, right = left, right, top, bottom
    aspect_ratio = max(top, bottom) / max(left, right, 1.0)
    width = int(round(height * aspect_ratio))
    destination = np.float32([[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]])
    matrix = cv2.getPerspectiveTransform(corners, destination)
    return cv2.warpPerspective(image, matrix, (width, height), flags=cv2.INTER_CUBIC,
                               borderMode=cv2.BORDER_REPLICATE)


def _character_boxes(gray: np.ndarray) -> list[tuple[float, float, float, float]]:
    denoised = cv2.medianBlur(gray, 3)
    enhanced = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(denoised)
    blackhat = cv2.morphologyEx(enhanced, cv2.MORPH_BLACKHAT, cv2.getStructuringElement(cv2.MORPH_RECT, (9, 15)))
    _, mask = cv2.threshold(blackhat, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3)))
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    height = gray.shape[0]
    boxes = []
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        if not CHAR_MIN_HEIGHT_FRACTION * height <= h <= CHAR_MAX_HEIGHT_FRACTION * height:
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
    for previous, box in zip(ordered, ordered[1:]):
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
                and CHAR_HEIGHT_RATIO_MIN <= h / reference_height <= CHAR_HEIGHT_RATIO_MAX
            ):
                group.append(box)
                break
        else:
            baseline_groups.append([box])
    return baseline_groups


def _cluster_characters_into_lines(boxes: list[tuple[float, float, float, float]]) -> list[np.ndarray]:
    corners = []
    for group in _group_by_baseline(boxes):
        for cluster in _split_by_horizontal_gap(group):
            if len(cluster) < MIN_CLUSTER_CHARACTERS:
                continue
            x0 = min(b[0] for b in cluster)
            y0 = min(b[1] for b in cluster)
            x1 = max(b[0] + b[2] for b in cluster)
            y1 = max(b[1] + b[3] for b in cluster)
            width, height = x1 - x0, y1 - y0
            if height == 0 or not MIN_PLATE_ASPECT_RATIO <= width / height <= MAX_PLATE_ASPECT_RATIO:
                continue
            corners.append(np.float32([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]))
    return corners


def _best_character_run(boxes: list[tuple[float, float, float, float]]) -> int:
    best = 0
    for group in _group_by_baseline(boxes):
        for cluster in _split_by_horizontal_gap(group):
            best = max(best, len(cluster))
    return best


def _candidate_corners(gray: np.ndarray) -> list[tuple[np.ndarray, bool]]:
    image_area = gray.shape[0] * gray.shape[1]
    enhanced = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)

    edges = cv2.Canny(cv2.bilateralFilter(enhanced, 9, 50, 50), 40, 160)
    edges = cv2.dilate(edges, np.ones((3, 3), np.uint8))
    edge_contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

    blackhat = cv2.morphologyEx(enhanced, cv2.MORPH_BLACKHAT, cv2.getStructuringElement(cv2.MORPH_RECT, (25, 9)))
    gradient = np.absolute(cv2.Sobel(blackhat, cv2.CV_32F, 1, 0, ksize=3))
    gradient = cv2.normalize(gradient, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
    gradient = cv2.GaussianBlur(gradient, (7, 7), 0)
    _, text_mask = cv2.threshold(gradient, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)
    text_mask = cv2.morphologyEx(text_mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (31, 7)))
    text_mask = cv2.erode(text_mask, None, iterations=1)
    text_contours, _ = cv2.findContours(text_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    candidates = []
    sources = [(contour, True) for contour in edge_contours] + [(contour, False) for contour in text_contours]
    for contour, is_plate_outline in sources:
        area = cv2.contourArea(contour)
        if not MIN_AREA_FRACTION * image_area <= area <= MAX_AREA_FRACTION * image_area:
            continue
        (_, _), (w, h), _ = cv2.minAreaRect(contour)
        long_side, short_side = max(w, h), min(w, h)
        if short_side == 0 or long_side < MIN_PLATE_WIDTH_PX / 2:
            continue
        if not MIN_PLATE_ASPECT_RATIO <= long_side / short_side <= MAX_PLATE_ASPECT_RATIO:
            continue
        corners = cv2.boxPoints(cv2.minAreaRect(contour))
        if is_plate_outline:
            approx = cv2.approxPolyDP(cv2.convexHull(contour), 0.04 * cv2.arcLength(contour, True), True)
            if len(approx) == 4:
                (_, _), (approx_w, approx_h), _ = cv2.minAreaRect(approx)
                approx_long, approx_short = max(approx_w, approx_h), min(approx_w, approx_h)
                if approx_short > 0 and MIN_PLATE_ASPECT_RATIO <= approx_long / approx_short <= MAX_PLATE_ASPECT_RATIO:
                    corners = approx
        candidates.append((_order_corners(corners), False))

    candidates.extend(
        (corners, True) for corners in _cluster_characters_into_lines(_character_boxes(gray))
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
    if patch.shape[1] < 8:
        return 0.0
    vertical_edges = np.absolute(cv2.Sobel(patch, cv2.CV_32F, 1, 0, ksize=3)).mean()
    horizontal_edges = np.absolute(cv2.Sobel(patch, cv2.CV_32F, 0, 1, ksize=3)).mean()
    contrast = float(patch.std())
    base_score = float(vertical_edges / (horizontal_edges + 1.0)) * contrast
    return base_score * _character_count_bonus(gray, corners)


def _boxes(a: np.ndarray, b: np.ndarray) -> tuple[tuple[float, float, float, float], tuple[float, float, float, float]]:
    return cv2.boundingRect(a.astype(np.float32)), cv2.boundingRect(b.astype(np.float32))


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


def find_plate_candidates(image: np.ndarray, max_candidates: int = 3) -> list[tuple[np.ndarray, bool]]:
    width = image.shape[1]
    scale = min(1.0, SEARCH_MAX_WIDTH / width)
    small = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA) if scale < 1 else image
    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)

    corners_by_source = _candidate_corners(gray)
    non_cluster = [corners for corners, is_cluster in corners_by_source if not is_cluster]
    clusters = [corners for corners, is_cluster in corners_by_source if is_cluster]

    scored = sorted(
        ((_text_score(gray, corners), corners) for corners in non_cluster), key=lambda item: item[0], reverse=True
    )
    chosen: list[np.ndarray] = []
    chosen_is_weak: list[bool] = []
    for _, corners in scored:
        if all(_overlap(corners, other) < 0.6 for other in chosen):
            chosen.append(corners)
            chosen_is_weak.append(False)
        if len(chosen) == max_candidates:
            break

    if clusters:
        best_cluster = max(clusters, key=lambda corners: _text_score(gray, corners))
        if not chosen or _covered_by(best_cluster, chosen[0]) < 0.6:
            index = 1 if chosen else 0
            chosen.insert(index, best_cluster)
            chosen_is_weak.insert(index, True)

    if non_cluster:
        largest = max(non_cluster, key=_region_area)
        if all(_covered_by(largest, other) < 0.6 for other in chosen):
            chosen.append(largest)
            chosen_is_weak.append(False)

    crops = [
        (rectify(image, _expand(corners / scale, CROP_MARGIN_X, CROP_MARGIN_Y)), is_weak)
        for corners, is_weak in zip(chosen, chosen_is_weak)
    ]
    if chosen:
        wide = rectify(image, _expand(chosen[0] / scale, WIDE_CROP_MARGIN_X, CROP_MARGIN_Y))
        crops.insert(1, (wide, chosen_is_weak[0]))
    return crops


def locate_plate(image: np.ndarray) -> np.ndarray:
    candidates = find_plate_candidates(image, max_candidates=1)
    return candidates[0][0] if candidates else image
