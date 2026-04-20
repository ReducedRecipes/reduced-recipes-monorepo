# ReducedRecipes — Architecture Diagram

```mermaid
graph TB
    subgraph "Clients"
        WEB["🌐 Web SPA<br/>React + Vite<br/>CF Pages"]
        MOB["📱 Mobile App<br/>Expo / React Native<br/>EAS Builds"]
    end

    subgraph "CDN / Edge"
        PAGES["Cloudflare Pages<br/>reducedrecipes.com"]
        WORKERS_DEV["*.workers.dev"]
    end

    WEB --> PAGES
    MOB --> API

    subgraph "API Layer"
        API["rr-api<br/>Hono HTTP Server<br/>─────────────<br/>Auth · Recipes · Search<br/>Bookmarks · Collections<br/>Shopping Lists · Sync<br/>Notifications · Dietary"]
        AUTH_MW["Auth Middleware<br/>requireAuth / optionalAuth"]
        DO["ShoppingListDO<br/>Durable Object<br/>─────────────<br/>WebSocket real-time<br/>collaboration"]
    end

    PAGES --> API
    API --> AUTH_MW
    API --> DO

    subgraph "External Services"
        GOOGLE["Google OAuth<br/>PKCE Flow"]
        WORKERS_AI["Workers AI<br/>─────────────<br/>Llama 3.1 8B<br/>(translation, dietary)<br/>m2m100-1.2B<br/>(cheap translation)"]
    end

    API --> GOOGLE
    API --> WORKERS_AI

    subgraph "Crawl Pipeline"
        direction LR
        ORCH["rr-orchestrator<br/>Cron: */5 * * * *<br/>─────────────<br/>• Select URLs (priority + random)<br/>• Spider sitemaps (3/run)<br/>• Reset stuck crawling"]
        CRAWLER["rr-crawler<br/>Queue Consumer<br/>─────────────<br/>• Fetch HTML<br/>• robots.txt check<br/>• Store HTML in KV<br/>• 20 concurrent"]
        PARSER["rr-parser<br/>Queue Consumer<br/>─────────────<br/>• Extract Schema.org<br/>• Detect language<br/>• Calc reduction stats<br/>• Discover links"]
        PROJ["rr-projection<br/>Queue Consumer<br/>─────────────<br/>• Dedup (title+domain)<br/>• Translate (Llama 3.1)<br/>• Dietary inference<br/>• Ingredient index<br/>• FTS index<br/>• Write D1 + KV"]
        DLQ["rr-dlq<br/>Dead Letter Handler<br/>─────────────<br/>crawl-dlq<br/>parse-dlq<br/>projection-dlq"]
    end

    ORCH -->|"crawl-jobs<br/>queue"| CRAWLER
    CRAWLER -->|"parse-jobs<br/>queue"| PARSER
    PARSER -->|"projection-jobs<br/>queue"| PROJ
    CRAWLER -.->|"failed"| DLQ
    PARSER -.->|"failed"| DLQ
    PROJ -.->|"failed"| DLQ

    subgraph "Data Stores"
        subgraph "D1 — Recipes DB<br/>reduced-recipes-prod"
            RECIPES_DB["recipes<br/>recipe_tags<br/>recipe_ingredients<br/>ingredients<br/>recipes_fts (FTS5)<br/>crawl_queue<br/>domains"]
        end

        subgraph "D1 — Users DB<br/>reduced-recipes-users"
            USERS_DB["users<br/>user_auth_providers<br/>user_dietary_preferences<br/>collections<br/>bookmarks<br/>recipe_views<br/>notifications<br/>consent_records<br/>shopping_lists<br/>shopping_list_recipes<br/>shopping_list_items"]
        end

        subgraph "KV Namespaces"
            RECIPES_KV["RECIPES_KV<br/>recipe:{id} → full JSON doc"]
            CACHE_KV["CACHE_KV<br/>html:{url} → page HTML<br/>robots:{domain} → allowed"]
            SESSION_KV["SESSION_KV<br/>session:{token} → user data"]
            USER_CACHE["USER_CACHE_KV<br/>user-prefs:{id} → dietary"]
        end

        R2["R2 — rr-images<br/>Recipe images"]
    end

    API --> RECIPES_DB
    API --> USERS_DB
    API --> RECIPES_KV
    API --> SESSION_KV
    API --> USER_CACHE
    DO --> USERS_DB

    ORCH --> RECIPES_DB
    CRAWLER --> CACHE_KV
    PARSER --> RECIPES_KV
    PARSER --> CACHE_KV
    PROJ --> RECIPES_DB
    PROJ --> RECIPES_KV
    PROJ --> WORKERS_AI

    subgraph "Ingredient Parse Queue"
        IPQ["ingredient-parse-jobs<br/>queue"]
    end
    API -->|"add recipe to list"| IPQ
    IPQ -->|"consumer in rr-api"| API

    classDef client fill:#E8F4FD,stroke:#2196F3,color:#1565C0
    classDef worker fill:#FFF3E0,stroke:#FF9800,color:#E65100
    classDef store fill:#E8F5E9,stroke:#4CAF50,color:#2E7D32
    classDef external fill:#F3E5F5,stroke:#9C27B0,color:#6A1B9A
    classDef queue fill:#FFFDE7,stroke:#FFC107,color:#F57F17

    class WEB,MOB client
    class API,ORCH,CRAWLER,PARSER,PROJ,DLQ,DO,AUTH_MW worker
    class RECIPES_DB,USERS_DB,RECIPES_KV,CACHE_KV,SESSION_KV,USER_CACHE,R2 store
    class GOOGLE,WORKERS_AI external
    class IPQ queue
```

## Data Flow Summary

### Recipe Ingestion
```mermaid
sequenceDiagram
    participant O as Orchestrator
    participant CQ as crawl-jobs
    participant C as Crawler
    participant PQ as parse-jobs
    participant P as Parser
    participant PJQ as projection-jobs
    participant PR as Projection
    participant D1 as Recipes D1
    participant KV as Recipes KV
    participant AI as Workers AI

    O->>O: Cron every 5 min
    O->>D1: SELECT pending URLs (priority first)
    O->>D1: Spider 3 sitemaps
    O->>D1: Reset stuck crawling > 10min
    O->>CQ: Enqueue 2000 URLs

    CQ->>C: Batch of 10 (×20 concurrent)
    C->>C: Check robots.txt
    C->>C: Fetch HTML (15s timeout)
    C->>KV: Store HTML (TTL 24h)
    C->>PQ: Enqueue {url, domain, htmlKey}

    PQ->>P: Batch of 5
    P->>KV: Read HTML
    P->>P: Extract Schema.org ld+json
    P->>P: Detect language
    P->>P: Calculate reduction stats
    P->>KV: Write RecipeDocument
    P->>PJQ: Enqueue {id, doc}

    PJQ->>PR: Batch of 25
    PR->>D1: Check dedup (title+domain)
    alt Non-English recipe
        PR->>AI: Translate title (Llama 3.1)
        PR->>AI: Translate ingredients (Llama 3.1)
        PR->>AI: Translate instructions (Llama 3.1)
        PR->>KV: Update with translated doc
    end
    PR->>AI: Infer dietary bitmask
    PR->>D1: INSERT recipe + tags + FTS + ingredients
    PR->>D1: Update reduction stats
```

### Auth Flow
```mermaid
sequenceDiagram
    participant U as User
    participant FE as Frontend
    participant API as rr-api
    participant G as Google OAuth
    participant KV as Session KV
    participant D1 as Users D1

    U->>FE: Click "Sign in"
    FE->>API: GET /auth/google/url?platform=web
    API->>API: Generate PKCE code_verifier
    API->>KV: Store code_verifier (keyed by state)
    API-->>FE: { url: "accounts.google.com/..." }
    FE->>G: Redirect to Google
    G-->>FE: Redirect with ?code=...&state=...
    FE->>API: GET /auth/google/callback?code=...&state=...
    API->>KV: Retrieve code_verifier
    API->>G: Exchange code for tokens (with PKCE)
    G-->>API: { id_token, access_token }
    API->>API: Decode JWT, extract user info
    API->>D1: Upsert user + auth provider
    API->>D1: Create default "Saved" collection
    API->>KV: Create session token
    API-->>FE: Set-Cookie: session={token}; HttpOnly; Secure
```

### Shopping List Real-Time
```mermaid
sequenceDiagram
    participant A as Client A
    participant DO as ShoppingListDO
    participant B as Client B
    participant D1 as Users D1

    A->>DO: WebSocket connect (Bearer token)
    B->>DO: WebSocket connect (share_token)
    DO->>D1: Load list state

    A->>DO: { type: "check", itemId: "abc" }
    DO->>DO: Apply mutation in memory
    DO->>B: { seq: 1, type: "checked", itemId: "abc", user: "Alice" }
    DO->>DO: Buffer D1 write

    Note over DO: Every 1.5 seconds
    DO->>D1: Flush buffered mutations
```
