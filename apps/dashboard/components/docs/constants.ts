/** High-level path: analyze UI through API, engine, GitHub, persistence. */
export const ANALYZE_ARCHITECTURE_DIAGRAM = `flowchart TB
    subgraph browser [Browser]
        dashUI[Dashboard UI]
    end
    subgraph nextApp [Next.js]
        mw[middleware SSR session refresh]
        apiAnalyze["POST api analyze"]
    end
    subgraph enginePkg [packages engine]
        analyzeUrl[analyzeFromGitHubUrl]
    end
    subgraph github [GitHub]
        ghIO[clone and REST APIs]
    end
    subgraph supabaseDb [Supabase]
        analysesTable[(analyses)]
    end
    dashUI --> mw
    mw --> apiAnalyze
    apiAnalyze --> analyzeUrl
    analyzeUrl --> ghIO
    analyzeUrl --> apiAnalyze
    apiAnalyze --> analysesTable
    analysesTable --> dashUI`;

/** GitHub sign-in and optional AI coach routes (OpenAI). */
export const AUTH_AND_AI_DIAGRAM = `flowchart TB
    subgraph browser [Browser]
        dashUI[Dashboard results and repos]
    end
    subgraph nextAuth [Next.js routes]
        callback["GET auth callback"]
        apiChat["POST api chat"]
        apiCoach["POST api coach says"]
        apiTab["POST api tab insight"]
    end
    subgraph supa [Supabase]
        session[session cookies SSR]
    end
    subgraph openaiSvc [OpenAI]
        completions[Responses API streaming]
    end
    subgraph github [GitHub]
        oauthGitHub[OAuth token for private repos]
    end
    dashUI --> callback
    callback --> session
    oauthGitHub -.-> callback
    session --> dashUI
    dashUI --> apiChat
    dashUI --> apiCoach
    dashUI --> apiTab
    apiChat --> completions
    apiCoach --> completions
    apiTab --> completions`;

/** Internal engine pipeline simplified (mirrors docs ARCHITECTURE.md). */
export const ENGINE_PIPELINE_DIAGRAM = `flowchart TB
    subgraph orchestrator [Orchestrator]
        analyzeRepo[analyzeRepo]
    end
    subgraph collectLayer [Collect]
        locDupGit[loc duplication git framework]
    end
    subgraph parsing [parsing]
        tsParser[Tree sitter TS TSX]
    end
    subgraph extract [extract]
        fnMetrics[function metrics smells react phase3]
    end
    subgraph result [types]
        repoReport[RepoReport JSON]
    end
    analyzeRepo --> locDupGit
    analyzeRepo --> tsParser
    analyzeRepo --> fnMetrics
    locDupGit --> repoReport
    tsParser --> repoReport
    fnMetrics --> repoReport`;

export const GIT_METRICS_DIAGRAM = `flowchart TD
    Start[GitHub URL] --> TryClone[Try git clone]
    TryClone -->|success| Local[git.mode = local]
    TryClone -->|git missing| Fail[Error: git required]
    Local --> Analyze[analyzeRepo]
    Analyze --> Done[Report ready]`;

/** @deprecated Use ANALYZE_ARCHITECTURE_DIAGRAM; kept for any external imports. */
export const ARCHITECTURE_DIAGRAM = ANALYZE_ARCHITECTURE_DIAGRAM;
