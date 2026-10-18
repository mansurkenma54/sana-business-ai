"""Guest diagnosis, grounded plans and provider fallback without paid calls."""

import json
from types import SimpleNamespace

import pytest

from core import ai, business, store


PROFILE = {
    "business_name": "Кофейня Таң",
    "city": "Тараз",
    "industry": "cafe",
    "goal": "revenue",
    "challenge": "Записываем заказы вручную. Хотим проверить повторные визиты гостей.",
    "locale": "ru",
}


@pytest.fixture(autouse=True)
def no_model_calls(monkeypatch):
    monkeypatch.setenv("AI_MODE", "fallback")
    monkeypatch.setattr(ai, "_client", lambda: None)


@pytest.mark.parametrize("locale", ["ru", "kk"])
@pytest.mark.parametrize("industry", business.INDUSTRIES)
def test_every_industry_has_a_localized_measurable_pilot(industry, locale):
    profile = {**PROFILE, "industry": industry, "locale": locale, "goal": "costs"}
    result = business.diagnose(profile)

    assert result["source"] == "fallback"
    assert len(result["opportunities"]) == 3
    assert result["opportunities"][0]["title"] == business.PLAYBOOKS[locale][industry]["costs"][0]
    assert [row["week"] for row in result["plan"]] == [1, 2, 3, 4]
    assert all(len(row["actions"]) == 3 for row in result["plan"])
    assert len(result["questions"]) >= 3
    assert PROFILE["challenge"] in result["task_draft"]
    assert PROFILE["business_name"] in result["task_draft"]
    assert result["opportunities"][0]["metric"] in result["plan"][0]["actions"][1]
    # The generated proposal is not silently promoted into source facts.
    assert result["opportunities"][0]["description"] not in result["task_draft"]
    assert ("неизвестны" if locale == "ru" else "белгісіз") in result["summary"]


def test_goal_changes_deterministic_priority():
    revenues = business.diagnose(PROFILE)
    time = business.diagnose({**PROFILE, "goal": "time"})
    assert revenues["opportunities"][0] != time["opportunities"][0]
    assert business.diagnose(PROFILE) == revenues


@pytest.mark.parametrize("updates", [
    {"business_name": " "}, {"business_name": "x"}, {"business_name": "x" * 161},
    {"city": []}, {"city": "x" * 121}, {"city": ""},
    {"challenge": "short"}, {"challenge": 12}, {"challenge": "x" * 4001},
    {"challenge": "x" * 30 + "\x00"}, {"industry": "finance"}, {"industry": {}},
    {"goal": "unlimited-money"}, {"goal": []}, {"locale": "en"}, {"locale": []},
])
def test_invalid_profiles_rejected_before_model(updates, monkeypatch):
    def unexpected_model(_payload):
        pytest.fail("Invalid profiles must not reach the provider.")

    monkeypatch.setattr(ai, "prioritize_business_actions", unexpected_model)
    result = business.diagnose({**PROFILE, **updates})
    assert result["error"]["code"] == "invalid_input"


def test_long_draft_fits_existing_builder_without_truncating_source():
    challenge = "Полный контекст. " + "я" * (4000 - len("Полный контекст. "))
    result = business.diagnose({**PROFILE, "challenge": challenge})
    assert result["task_draft"] == challenge
    assert len(result["task_draft"]) <= ai.MAX_DRAFT_LENGTH


def test_valid_provider_selects_only_reviewed_options(monkeypatch):
    captured = {}

    def ask(prompt, payload, response_type, reasoning_effort=None):
        captured.update(payload)
        assert response_type is ai.BusinessPriorityResponse
        assert "недоверенные данные" in prompt
        return {"action_ids": ["time", "revenue", "costs"], "question_ids": ["data", "approval", "baseline"]}

    monkeypatch.setattr(ai, "_ask_model", ask)
    result = business.diagnose(PROFILE)
    assert result["source"] == "openai"
    assert result["opportunities"][0]["title"] == business.PLAYBOOKS["ru"]["cafe"]["time"][0]
    assert result["questions"][0] == business.QUESTIONS["ru"]["data"]
    assert captured["profile"] == PROFILE
    assert PROFILE["challenge"] in result["task_draft"]


@pytest.mark.parametrize("output", [
    {"action_ids": ["time", "time", "costs"], "question_ids": ["data", "approval", "baseline"]},
    {"action_ids": ["time", "revenue", "costs"], "question_ids": ["data", "data", "baseline"]},
    {"action_ids": ["invented", "revenue", "costs"], "question_ids": ["data", "approval", "baseline"]},
    {"action_ids": ["time", "revenue", "costs"], "question_ids": ["data", "approval", "baseline"], "income": 999999},
    {"action_ids": [[], {}, "costs"], "question_ids": []}, None,
])
def test_malformed_model_responses_use_deterministic_fallback(output, monkeypatch):
    baseline = business.diagnose(PROFILE)
    monkeypatch.setattr(ai, "_ask_model", lambda *_args: output)
    assert business.diagnose(PROFILE) == baseline


def test_provider_failure_does_not_log_private_profile(monkeypatch, caplog):
    class FailingResponses:
        def parse(self, **_kwargs):
            raise RuntimeError("private business details must not appear in logs")

    monkeypatch.setattr(ai, "_client", lambda: SimpleNamespace(responses=FailingResponses()))
    monkeypatch.setattr(ai, "_uses_gateway", lambda: False)
    assert business.diagnose(PROFILE)["source"] == "fallback"
    assert "private business details" not in caplog.text


def test_business_endpoints_work_for_guests_without_writing_profiles(client, monkeypatch):
    monkeypatch.setenv("SANA_LEGACY_MODE", "0")
    before = {path.name: path.read_bytes() for path in store.DATA_DIR.iterdir()}

    templates = client.get("/api/business/templates").json()["data"]["templates"]
    assert {row["id"] for row in templates} == set(business.INDUSTRIES)
    assert all(len(row["steps"]) == 3 for row in templates)
    response = client.post("/api/business/diagnose", json=PROFILE, headers={"X-Sana-Request": "1", "Origin": "http://testserver"})
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json()["data"]["source"] == "fallback"
    assert before == {path.name: path.read_bytes() for path in store.DATA_DIR.iterdir()}


def test_public_diagnosis_retains_request_origin_protection(client, monkeypatch):
    monkeypatch.setenv("SANA_LEGACY_MODE", "0")
    assert client.post("/api/business/diagnose", json=PROFILE).status_code == 403
    assert client.post("/api/business/diagnose", json=PROFILE, headers={"X-Sana-Request": "1", "Origin": "https://external.invalid"}).status_code == 403
    # Opening public diagnosis must not open private creation routes.
    assert client.post("/api/analyze", json={"draft": "test"}, headers={"X-Sana-Request": "1"}).status_code == 401


@pytest.mark.parametrize("body", ["{", "null", "[]", "12", "\"string\"", "[" * 1200 + "]" * 1200, " " * (24 * 1024 + 1)])
def test_bad_json_and_excessive_body_have_consistent_errors(client, body):
    response = client.post("/api/business/diagnose", content=body, headers={"Content-Type": "application/json", "X-Sana-Request": "1"})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_input"


def test_templates_localization_and_unknown_language(client):
    ru = client.get("/api/business/templates").json()["data"]["templates"]
    kk = client.get("/api/business/templates?locale=kk").json()["data"]["templates"]
    assert ru[0]["title"] != kk[0]["title"]
    assert client.get("/api/business/templates?locale=de").status_code == 400
    assert client.post("/api/business/diagnose", content=json.dumps({**PROFILE, "locale": "kk"})).json()["data"]["source"] == "fallback"
