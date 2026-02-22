"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { FileDetailSheet } from "./FileDetailSheet";
import type { RepoReport, PerFileEntry } from "@/lib/reportTypes";

type SortKey = "file" | "functions" | "maxComplexity" | "avgComplexity" | "longestFn" | "maxNesting";
type SortDir = "asc" | "desc";

function fileStats(pf: PerFileEntry) {
  const maxComplexity =
    pf.complexity.length > 0
      ? Math.max(...pf.complexity.map((c) => c.complexity))
      : 0;
  const avgComplexity =
    pf.complexity.length > 0
      ? pf.complexity.reduce((s, c) => s + c.complexity, 0) / pf.complexity.length
      : 0;
  const longestFn =
    pf.functionMetrics.length > 0
      ? Math.max(...pf.functionMetrics.map((f) => f.lines))
      : 0;
  const maxNesting =
    pf.functionMetrics.length > 0
      ? Math.max(...pf.functionMetrics.map((f) => f.maxNestingDepth))
      : 0;
  return { maxComplexity, avgComplexity, longestFn, maxNesting };
}

interface FileTableProps {
  report: RepoReport;
}

export function FileTable({ report }: FileTableProps) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("file");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selectedFile, setSelectedFile] = useState<PerFileEntry | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const rows = useMemo(() => {
    let list = report.perFile
      .filter((pf) => pf.file.toLowerCase().includes(search.toLowerCase()))
      .map((pf) => ({ ...pf, ...fileStats(pf) }));

    const mult = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      const av = a[sortKey as keyof typeof a];
      const bv = b[sortKey as keyof typeof b];
      if (typeof av === "number" && typeof bv === "number")
        return mult * (av - bv);
      return mult * String(av).localeCompare(String(bv));
    });
    return list;
  }, [report.perFile, search, sortKey, sortDir]);

  const paginated = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(rows.length / PAGE_SIZE);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else setSortKey(key);
    setPage(0);
  };

  const Th = ({
    k,
    children,
  }: {
    k: SortKey;
    children: React.ReactNode;
  }) => (
    <TableHead>
      <button
        type="button"
        onClick={() => handleSort(k)}
        className="hover:underline text-left w-full"
      >
        {children} {sortKey === k && (sortDir === "asc" ? "↑" : "↓")}
      </button>
    </TableHead>
  );

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Files</CardTitle>
          <CardDescription>
            Search and sort by file metrics. Click a row for details.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Search by file path..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="max-w-sm"
          />
          <Table>
            <TableHeader>
              <TableRow>
                <Th k="file">File</Th>
                <Th k="functions">Functions</Th>
                <Th k="maxComplexity">Max Complexity</Th>
                <Th k="avgComplexity">Avg Complexity</Th>
                <Th k="longestFn">Longest Fn</Th>
                <Th k="maxNesting">Max Nesting</Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.map((row) => (
                <TableRow
                  key={row.file}
                  className="cursor-pointer"
                  onClick={() => setSelectedFile(row)}
                >
                  <TableCell className="font-mono text-sm truncate max-w-[200px]">
                    {row.file}
                  </TableCell>
                  <TableCell>{row.functions}</TableCell>
                  <TableCell>{row.maxComplexity}</TableCell>
                  <TableCell>{row.avgComplexity.toFixed(1)}</TableCell>
                  <TableCell>{row.longestFn}</TableCell>
                  <TableCell>{row.maxNesting}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Page {page + 1} of {totalPages} ({rows.length} files)
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="disabled:opacity-50 hover:underline"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="disabled:opacity-50 hover:underline"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <FileDetailSheet
        file={selectedFile}
        onClose={() => setSelectedFile(null)}
      />
    </>
  );
}
