BAD_REQUEST = "Requisição inválida."
INVALID_CREDENTIALS = "Credenciais inválidas."
NOT_FOUND = "Recurso não encontrado."
CONFLICT = "Conflito com o estado atual do recurso."
PAYLOAD_TOO_LARGE = "Arquivo maior que o limite permitido."
UNPROCESSABLE = "Dados inválidos."
SERVICE_UNAVAILABLE = "Serviço indisponível."

VALIDATION_ERROR_CONTENT = {
    "application/json": {"schema": {"$ref": "#/components/schemas/HTTPValidationError"}}
}
