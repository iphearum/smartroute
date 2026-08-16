"use client";
import { useCallback, useState } from "react";
import { routesApi } from "@/features/routes/api/routes-api";
type ImportState = {
  status: string;
  message: string;
  found?: number;
  created?: number;
  updated?: number;
};
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export function usePoiImport() {
  const [state, setState] = useState<ImportState>({
    status: "idle",
    message: "",
  });
  const start = useCallback(async (query: string) => {
    setState({ status: "starting", message: "Starting import…" });
    try {
      const { id } = await routesApi.importPlaces(query);
      for (;;) {
        await wait(1200);
        const job = await routesApi.importStatus(id),
          next = {
            status: String(job.status),
            message: String(job.message),
            found: Number(job.found || 0),
            created: Number(job.created || 0),
            updated: Number(job.updated || 0),
          };
        setState(next);
        if (next.status === "complete" || next.status === "failed") break;
      }
    } catch (error) {
      setState({
        status: "failed",
        message: error instanceof Error ? error.message : "Import failed",
      });
    }
  }, []);
  return {
    state,
    start,
    running: ["starting", "queued", "downloading", "saving"].includes(
      state.status,
    ),
  };
}
