import httpx
import pytest

from tubescope.youtube import API_ROOT, YouTubeAPIError, YouTubeClient

SECRET = "test-key-not-real"


def _client(handler):
    return YouTubeClient(
        SECRET,
        http=httpx.Client(base_url=API_ROOT, transport=httpx.MockTransport(handler)),
        retry_wait=0,
    )


def test_most_popular_follows_pages_and_caps():
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        params = request.url.params
        calls.append(dict(params))
        page = int(params.get("pageToken", "0"))
        items = [{"id": f"v{page * 50 + i}"} for i in range(int(params["maxResults"]))]
        return httpx.Response(200, json={"items": items, "nextPageToken": str(page + 1)})

    with _client(handler) as client:
        items = client.most_popular("US", max_videos=120)

    assert len(items) == 120
    assert [c["maxResults"] for c in calls] == ["50", "50", "20"]
    assert all(c["chart"] == "mostPopular" and c["regionCode"] == "US" for c in calls)


def test_most_popular_stops_without_next_page():
    def handler(request):
        return httpx.Response(200, json={"items": [{"id": "only"}]})

    with _client(handler) as client:
        assert client.most_popular("US") == [{"id": "only"}]


def test_channels_are_deduplicated_and_batched():
    seen = []

    def handler(request):
        ids = request.url.params["id"].split(",")
        seen.append(ids)
        return httpx.Response(200, json={"items": [{"id": i} for i in ids]})

    ids = [f"UC{i}" for i in range(60)] + ["UC1", "", None]
    with _client(handler) as client:
        result = client.channels(ids)

    assert [len(batch) for batch in seen] == [50, 10]
    assert len(result) == 60


def test_errors_do_not_leak_the_api_key():
    def handler(request):
        return httpx.Response(403, json={"error": {"message": "quotaExceeded"}})

    with _client(handler) as client, pytest.raises(YouTubeAPIError) as excinfo:
        client.video_categories("US")

    assert "quotaExceeded" in str(excinfo.value)
    assert SECRET not in str(excinfo.value)


def test_network_errors_do_not_leak_the_api_key():
    def handler(request):
        raise httpx.ConnectError(f"failed for {request.url}")

    with _client(handler) as client, pytest.raises(YouTubeAPIError) as excinfo:
        client.most_popular("US")

    assert SECRET not in str(excinfo.value)
    assert excinfo.value.__cause__ is None


def test_transient_errors_are_retried():
    responses = iter([httpx.Response(503), httpx.Response(200, json={"items": [{"id": "ok"}]})])

    with _client(lambda request: next(responses)) as client:
        assert client.most_popular("US") == [{"id": "ok"}]


def test_quota_errors_are_not_retried():
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(403, json={"error": {"message": "quotaExceeded"}})

    with _client(handler) as client, pytest.raises(YouTubeAPIError):
        client.most_popular("US")
    assert len(calls) == 1


def test_retries_give_up_after_max_attempts():
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(500)

    with _client(handler) as client, pytest.raises(YouTubeAPIError, match="HTTP 500"):
        client.most_popular("US")
    assert len(calls) == 3
