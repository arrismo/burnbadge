# burnbadge

Track your AI API spend and display it as Shield.io badges or burn-down charts.

**How it works:** Log your usage via the API (`POST /api/usage/:token`), then embed badges (`/api/badge/:token`) and charts (`/api/chart/:token`) anywhere — READMEs, dashboards, blog posts. Supports Anthropic, OpenAI, OpenRouter, and OpenCode.

---

Flat badge:

![openai spend](https://img.shields.io/endpoint?url=https%3A%2F%2Fburnbadge.mikaelmoise00.workers.dev%2Fapi%2Fbadge%2F034151d1-1491-476e-98f5-f9d2fb25f9ed%3Fdays%3D30&logo=openaigym)

Flat-square badge:

![openai spend flat-square](https://img.shields.io/endpoint?url=https%3A%2F%2Fburnbadge.mikaelmoise00.workers.dev%2Fapi%2Fbadge%2F034151d1-1491-476e-98f5-f9d2fb25f9ed%3Fdays%3D30&logo=openaigym&style=flat-square)

30-day chart:

![openai spend chart](https://burnbadge.mikaelmoise00.workers.dev/api/chart/034151d1-1491-476e-98f5-f9d2fb25f9ed?days=30)
