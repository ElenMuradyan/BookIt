from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


class ErrorDetail(CamelModel):
    code: str
    message: str
    field_errors: dict[str, str] | None = None
    request_id: str | None = None


class OkResponse(CamelModel):
    ok: bool = True
    message: str | None = None
