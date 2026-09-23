# Backend

API em Python (FastAPI) responsável por:

- Receber a imagem da placa (upload ou câmera) e localizar/recortar a placa com OpenCV
- Rodar o OCR (Tesseract ou EasyOCR) e validar o formato de placa Mercosul
- Registrar o check-in no PostgreSQL
- Calcular a fila estimada por média móvel do histórico de check-ins

Em desenvolvimento — estrutura de código ainda será adicionada.
