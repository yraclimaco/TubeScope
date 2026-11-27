"""Minimal YouTube Data API v3 client for the daily chart pull.

Quota cost per run is a handful of units: ``videos.list`` and ``channels.list`` cost 1 unit
per page, against the default 10,000 units per day.
"""

from __future__ import annotations

import time
from collections.abc import Iterable, Iterator

import httpx

API_ROOT = "https://www.googleapis.com/youtube/v3"
PAGE_SIZE = 50  # maximum allowed by videos.list and channels.list
RETRY_STATUSES = {429, 500, 502, 503, 504}


class YouTubeAPIError(RuntimeError):
    """Raised for non-2xx responses. The message never includes the API key."""


class YouTubeClient:
    def __init__(
        self,
        api_key: str,
        *,
        http: httpx.Client | None = None,
        timeout: float = 20.0,
        attempts: int = 3,
        retry_wait: float = 2.0,
    ):
        """``attempts``/``retry_wait``: transient failures (network errors, 429, 5xx) are
        retried with exponential backoff; quota and permission errors are not."""
        self._key = api_key
        self._http = http or httpx.Client(base_url=API_ROOT, timeout=timeout)
        self._attempts = max(1, attempts)
        self._retry_wait = retry_wait

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> YouTubeClient:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def _get(self, resource: str, params: dict[str, object]) -> dict:
        for attempt in range(1, self._attempts + 1):
            last = attempt == self._attempts
            try:
                response = self._http.get(f"/{resource}", params={**params, "key": self._key})
            except httpx.HTTPError as exc:  # network failure; drop the URL, which holds the key
                if last:
                    raise YouTubeAPIError(
                        f"{resource}: request failed ({type(exc).__name__})"
                    ) from None
            else:
                if response.status_code not in RETRY_STATUSES or last:
                    break
            time.sleep(self._retry_wait * 2 ** (attempt - 1))
        if response.status_code >= 400:
            try:
                error = response.json().get("error", {})
                reason = error.get("message") or response.reason_phrase
            except ValueError:
                reason = response.reason_phrase
            raise YouTubeAPIError(f"{resource}: HTTP {response.status_code}: {reason}")
        return response.json()

    def most_popular(self, region: str, max_videos: int = 200) -> list[dict]:
        """Return the region's ``mostPopular`` chart in order, following pagination."""
        items: list[dict] = []
        page_token: str | None = None
        while len(items) < max_videos:
            params: dict[str, object] = {
                "part": "snippet,contentDetails,statistics",
                "chart": "mostPopular",
                "regionCode": region,
                "maxResults": min(PAGE_SIZE, max_videos - len(items)),
            }
            if page_token:
                params["pageToken"] = page_token
            payload = self._get("videos", params)
            items.extend(payload.get("items", []))
            page_token = payload.get("nextPageToken")
            if not page_token:
                break
        return items[:max_videos]

    def channels(self, channel_ids: Iterable[str]) -> list[dict]:
        unique = list(dict.fromkeys(cid for cid in channel_ids if cid))
        results: list[dict] = []
        for batch in _chunks(unique, PAGE_SIZE):
            payload = self._get(
                "channels", {"part": "snippet,statistics", "id": ",".join(batch), "maxResults": 50}
            )
            results.extend(payload.get("items", []))
        return results

    def video_categories(self, region: str) -> list[dict]:
        return self._get("videoCategories", {"part": "snippet", "regionCode": region}).get(
            "items", []
        )


def _chunks(values: list[str], size: int) -> Iterator[list[str]]:
    for start in range(0, len(values), size):
        yield values[start : start + size]
