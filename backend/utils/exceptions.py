class ProjectHubException(Exception):
    def __init__(self, status_code: int, code: str, message: str, detail: dict = None):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.detail = detail or {}


class NotFoundError(ProjectHubException):
    def __init__(self, message: str = "Resource not found", detail: dict = None):
        super().__init__(
            status_code=404, code="NOT_FOUND", message=message, detail=detail
        )


class ForbiddenError(ProjectHubException):
    def __init__(self, message: str = "Action forbidden", detail: dict = None):
        super().__init__(
            status_code=403, code="FORBIDDEN", message=message, detail=detail
        )


class ValidationError(ProjectHubException):
    def __init__(self, message: str = "Validation failed", detail: dict = None):
        super().__init__(
            status_code=422, code="VALIDATION_ERROR", message=message, detail=detail
        )


class ConflictError(ProjectHubException):
    def __init__(self, message: str = "Resource conflict", detail: dict = None):
        super().__init__(
            status_code=409, code="CONFLICT", message=message, detail=detail
        )


class RateLimitError(ProjectHubException):
    def __init__(self, message: str = "Too many requests", detail: dict = None):
        super().__init__(
            status_code=429, code="RATE_LIMIT", message=message, detail=detail
        )


class UnauthorizedError(ProjectHubException):
    def __init__(self, message: str = "Unauthorized", detail: dict = None):
        super().__init__(
            status_code=401, code="UNAUTHORIZED", message=message, detail=detail
        )
