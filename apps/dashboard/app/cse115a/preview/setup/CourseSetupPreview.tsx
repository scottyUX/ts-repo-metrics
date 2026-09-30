"use client";

import { useState } from "react";
import { CourseSetup } from "@/components/cse115a/CourseSetup";

export type SetupPreviewState = "course" | "github" | "connected";

// Local preview of the setup card. Joining accepts any code; Connect GitHub only toggles state.
export function CourseSetupPreview({ state }: { state: SetupPreviewState }) {
  const [joined, setJoined] = useState(state !== "course");
  const [connected, setConnected] = useState(state === "connected");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="w-full max-w-5xl py-8">
      <CourseSetup
        email="student@ucsc.edu"
        courseLabel={joined ? "CSE 115A · Fall 2026" : null}
        githubConnected={connected}
        githubLogin={connected ? "a-student" : null}
        joinCode={code}
        onJoinCodeChange={(value) => { setCode(value); setError(null); }}
        onJoin={() => (code.trim() ? setJoined(true) : setError("Enter the code from your instructor."))}
        joining={false}
        joinError={error}
        onConnectGithub={() => setConnected(true)}
        connectingGithub={false}
      />
    </div>
  );
}
