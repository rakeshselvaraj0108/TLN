from fastapi import HTTPException


def not_recovered(operation_id: str) -> HTTPException:
    """Handler logic was not recoverable from the deployment; see api/README.md."""
    return HTTPException(status_code=501, detail=f"{operation_id}: server logic not recovered")
