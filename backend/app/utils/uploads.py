from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile

from app.config import UPLOAD_ROOT


MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024
UPLOAD_CHUNK_SIZE = 64 * 1024
ALLOWED_UPLOADS = {
    ".pdf": {
        "content_types": {"application/pdf"},
        "signatures": (b"%PDF-",),
    },
    ".jpg": {
        "content_types": {"image/jpeg"},
        "signatures": (b"\xff\xd8\xff",),
    },
    ".jpeg": {
        "content_types": {"image/jpeg"},
        "signatures": (b"\xff\xd8\xff",),
    },
    ".png": {
        "content_types": {"image/png"},
        "signatures": (b"\x89PNG\r\n\x1a\n",),
    },
}


class UploadValidationError(ValueError):
    pass


def public_upload_name(
    stored_path: str | None,
    label: str,
) -> str | None:
    if not stored_path:
        return None

    extension = Path(stored_path).suffix.lower()
    return (
        f"{label}{extension}"
        if extension in ALLOWED_UPLOADS
        else label
    )


def _upload_directory(subdirectory: str | None = None) -> Path:
    directory = UPLOAD_ROOT
    if subdirectory:
        relative_directory = Path(subdirectory)
        if relative_directory.is_absolute() or ".." in relative_directory.parts:
            raise UploadValidationError("Invalid upload directory")
        directory = (UPLOAD_ROOT / relative_directory).resolve()

    try:
        directory.relative_to(UPLOAD_ROOT)
    except ValueError as error:
        raise UploadValidationError("Invalid upload directory") from error

    return directory


def _validate_upload_metadata(upload: UploadFile) -> tuple[str, dict]:
    extension = Path(upload.filename or "").suffix.lower()
    upload_rules = ALLOWED_UPLOADS.get(extension)
    if upload_rules is None:
        raise UploadValidationError(
            "Only PDF, JPG, JPEG, and PNG files are allowed"
        )

    content_type = (upload.content_type or "").split(";", 1)[0].strip().lower()
    if content_type not in upload_rules["content_types"]:
        raise UploadValidationError(
            "File content type does not match an allowed upload type"
        )

    return extension, upload_rules


def store_validated_upload(
    upload: UploadFile,
    subdirectory: str | None = None,
) -> Path:
    extension, upload_rules = _validate_upload_metadata(upload)
    upload_directory = _upload_directory(subdirectory)
    upload_directory.mkdir(parents=True, exist_ok=True)

    file_id = uuid4().hex
    destination = upload_directory / f"{file_id}{extension}"
    temporary_path = upload_directory / f".{file_id}.uploading"
    total_size = 0
    header = bytearray()

    try:
        with temporary_path.open("xb") as output:
            while True:
                chunk = upload.file.read(UPLOAD_CHUNK_SIZE)
                if not chunk:
                    break

                total_size += len(chunk)
                if total_size > MAX_UPLOAD_SIZE_BYTES:
                    raise UploadValidationError(
                        "Upload exceeds the 5 MB file size limit"
                    )

                if len(header) < 16:
                    header.extend(chunk[: 16 - len(header)])
                output.write(chunk)

        if total_size == 0:
            raise UploadValidationError("Uploaded file is empty")

        if not any(
            bytes(header).startswith(signature)
            for signature in upload_rules["signatures"]
        ):
            raise UploadValidationError(
                "File content does not match its extension"
            )

        temporary_path.replace(destination)
        return destination
    except Exception:
        temporary_path.unlink(missing_ok=True)
        destination.unlink(missing_ok=True)
        raise


def resolve_stored_upload(
    stored_path: str,
    subdirectory: str | None = None,
) -> Path:
    upload_directory = _upload_directory(subdirectory)
    path = Path(stored_path)
    candidate = (
        path.resolve(strict=True)
        if path.is_absolute()
        else (Path.cwd() / path).resolve(strict=True)
    )

    candidate.relative_to(upload_directory)
    if not candidate.is_file():
        raise FileNotFoundError(stored_path)
    return candidate


def delete_stored_upload(
    stored_path: str | Path | None,
    subdirectory: str | None = None,
) -> None:
    if not stored_path:
        return

    try:
        upload_directory = _upload_directory(subdirectory)
        path = Path(stored_path)
        candidate = (
            path.resolve()
            if path.is_absolute()
            else (Path.cwd() / path).resolve()
        )
        candidate.relative_to(upload_directory)
        candidate.unlink(missing_ok=True)
    except (OSError, ValueError):
        pass
