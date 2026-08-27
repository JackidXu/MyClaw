# Client Sidebar Banner Schedule

## Change Summary

lobsterai-server now schedules sidebar banners with second-precision UTC online and offline times. LobsterAI persists the latest server-confirmed snapshot, removes expired banners locally at the offline boundary, and reconciles Admin changes at least every five minutes while active.

## Endpoint Details

`GET /api/client-banners/snapshot?placement=desktop_sidebar`

Auth: public. The response is not cacheable.

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "serverTime": "2026-08-27T04:00:00Z",
    "nextRefreshAt": "2026-08-27T05:00:00Z",
    "banners": [
      {
        "id": 1,
        "placement": "desktop_sidebar",
        "activityDescription": "活动说明",
        "onlineAt": "2026-08-27T04:00:00",
        "offlineAt": "2026-08-27T05:00:00",
        "linkUrl": "https://example.com",
        "imageUrl": "https://example.com/banner.png",
        "updatedAt": "2026-08-27T03:30:00"
      }
    ]
  }
}
```

`banners` contains only currently effective entries. `nextRefreshAt` is the next enabled online or offline boundary and can be present while `banners` is empty. The legacy `/active` and `/active-list` endpoints remain available and now apply the same time-window filter.

## Frontend Action Items

- Persist `serverTime`, `nextRefreshAt`, the active banner list, and the client save time in the SQLite key `client_sidebar_banner.schedule.desktop_sidebar.v1`.
- Calculate timer delays from server-relative time, remove a banner locally when `offlineAt` arrives, and then refresh the snapshot.
- Refresh on focus/visibility recovery and every 4.5 to 5 minutes; discard cache older than ten minutes when the server cannot be reached.
- Fall back to `/active-list` when running against a server version without the snapshot endpoint.

## Auth Requirements

No login state or user identity is required.

## Notes & Caveats

An offline client cannot observe an Admin schedule change until connectivity returns. Local expiry is fail-closed: expired or stale cached banners remain hidden even if the boundary refresh fails.
