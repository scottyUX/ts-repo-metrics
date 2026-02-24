"use client";

import { useState, useMemo } from "react";
import {
  buildFeatureVector,
  getFeatureCategory,
  getFeatureRqMapping,
} from "@/lib/featureVector";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import type { RepoReport } from "@/lib/reportTypes";

interface FeatureVectorTableProps {
  report: RepoReport;
}

export function FeatureVectorTable({ report }: FeatureVectorTableProps) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "category">("category");

  const vec = useMemo(() => buildFeatureVector(report), [report]);
  const entries = useMemo(() => Object.entries(vec), [vec]);

  const filtered = useMemo(() => {
    if (!search.trim()) return entries;
    const q = search.toLowerCase();
    return entries.filter(([name]) => name.toLowerCase().includes(q));
  }, [entries, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortBy === "name") {
        return a[0].localeCompare(b[0]);
      }
      const catA = getFeatureCategory(a[0]);
      const catB = getFeatureCategory(b[0]);
      return catA.localeCompare(catB) || a[0].localeCompare(b[0]);
    });
  }, [filtered, sortBy]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <Input
          placeholder="Search by feature name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setSortBy("name")}
            className={`text-sm ${sortBy === "name" ? "font-medium underline" : "text-muted-foreground hover:underline"}`}
          >
            Sort by name
          </button>
          <span className="text-muted-foreground">|</span>
          <button
            type="button"
            onClick={() => setSortBy("category")}
            className={`text-sm ${sortBy === "category" ? "font-medium underline" : "text-muted-foreground hover:underline"}`}
          >
            Sort by category
          </button>
        </div>
      </div>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Feature Name</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>RQ Mapping</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map(([name, value]) => (
              <TableRow key={name}>
                <TableCell className="font-mono text-sm">{name}</TableCell>
                <TableCell>{String(value)}</TableCell>
                <TableCell>{getFeatureCategory(name)}</TableCell>
                <TableCell>{getFeatureRqMapping(name)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
