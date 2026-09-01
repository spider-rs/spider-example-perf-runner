"use client";

import { useState } from "react";
import SearchBar from "./searchbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface PerfMetrics {
  url: string;
  sizeKB: number;
  scripts: number;
  stylesheets: number;
  images: number;
  iframes: number;
  domElements: number;
  noLazyImages: number;
  score: number;
}

function analyzePerf(url: string, html: string): PerfMetrics {
  const sizeKB = Math.round(new Blob([html]).size / 1024 * 10) / 10;
  const scripts = (html.match(/<script[\s>]/gi) || []).length;
  const stylesheets = (html.match(/<link[^>]*rel=["']stylesheet["']/gi) || []).length;
  const images = (html.match(/<img[\s]/gi) || []).length;
  const iframes = (html.match(/<iframe[\s]/gi) || []).length;
  const domElements = (html.match(/<[a-z][^>]*>/gi) || []).length;
  const lazyImages = (html.match(/<img[^>]*loading=["']lazy["']/gi) || []).length;
  const noLazyImages = images - lazyImages;

  let score = 100;
  if (sizeKB > 500) score -= 20; else if (sizeKB > 200) score -= 10;
  if (scripts > 15) score -= 15; else if (scripts > 8) score -= 5;
  if (stylesheets > 5) score -= 10; else if (stylesheets > 3) score -= 5;
  if (domElements > 1500) score -= 15; else if (domElements > 800) score -= 5;
  if (noLazyImages > 5) score -= 10; else if (noLazyImages > 2) score -= 5;
  if (iframes > 3) score -= 10; else if (iframes > 0) score -= 3;

  return { url, sizeKB, scripts, stylesheets, images, iframes, domElements, noLazyImages, score: Math.max(0, score) };
}

type SortKey = "url" | "sizeKB" | "scripts" | "stylesheets" | "images" | "domElements" | "score";
type SortDir = "asc" | "desc";
type ScoreFilter = "all" | "good" | "ok" | "poor";
type ExportFormat = "json" | "csv" | "markdown";

function scoreColor(score: number): string {
  if (score >= 80) return "text-green-400";
  if (score >= 50) return "text-yellow-400";
  return "text-red-400";
}

function scoreBg(score: number): string {
  if (score >= 80) return "bg-green-500/10 border-green-500/20";
  if (score >= 50) return "bg-yellow-500/10 border-yellow-500/20";
  return "bg-red-500/10 border-red-500/20";
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportMetrics(metrics: PerfMetrics[], format: ExportFormat) {
  const ts = new Date().toISOString().slice(0, 10);
  const avg = metrics.length ? Math.round(metrics.reduce((s, m) => s + m.score, 0) / metrics.length) : 0;

  if (format === "json") {
    downloadBlob(JSON.stringify({ date: ts, averageScore: avg, pages: metrics }, null, 2), `perf-report-${ts}.json`, "application/json");
  } else if (format === "csv") {
    const rows = [["URL", "Size (KB)", "Scripts", "Stylesheets", "Images", "iframes", "DOM Elements", "Non-Lazy Images", "Score"]];
    for (const m of metrics) {
      rows.push([m.url, String(m.sizeKB), String(m.scripts), String(m.stylesheets), String(m.images), String(m.iframes), String(m.domElements), String(m.noLazyImages), String(m.score)]);
    }
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    downloadBlob(csv, `perf-report-${ts}.csv`, "text/csv");
  } else {
    let md = `# Performance Report\n\n**Date:** ${ts}\n**Pages:** ${metrics.length}\n**Average Score:** ${avg}/100\n\n`;
    md += "| URL | Size | Scripts | CSS | Images | DOM | Score |\n";
    md += "|-----|------|---------|-----|--------|-----|-------|\n";
    for (const m of metrics) {
      md += `| ${m.url} | ${m.sizeKB} KB | ${m.scripts} | ${m.stylesheets} | ${m.images} | ${m.domElements} | ${m.score} |\n`;
    }
    downloadBlob(md, `perf-report-${ts}.md`, "text/markdown");
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span className={`inline-block ml-0.5 text-[10px] ${active ? "text-[#3bde77]" : "text-muted-foreground/40"}`}>
      {active ? (dir === "asc" ? "▲" : "▼") : "⇅"}
    </span>
  );
}

export default function Runner() {
  const [data, setData] = useState<any[] | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filter, setFilter] = useState<ScoreFilter>("all");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("json");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "url" ? "asc" : "asc");
    }
  };

  const metrics = (data || []).filter((p) => p?.url && p?.content).map((p) => analyzePerf(p.url, p.content));
  const avgScore = metrics.length ? Math.round(metrics.reduce((s, m) => s + m.score, 0) / metrics.length) : 0;
  const avgSize = metrics.length ? Math.round(metrics.reduce((s, m) => s + m.sizeKB, 0) / metrics.length * 10) / 10 : 0;
  const totalResources = metrics.reduce((s, m) => s + m.scripts + m.stylesheets + m.images, 0);
  const largest = metrics.length ? metrics.reduce((a, b) => a.sizeKB > b.sizeKB ? a : b) : null;
  const maxSize = metrics.length ? Math.max(...metrics.map((m) => m.sizeKB)) : 1;

  const goodCount = metrics.filter((m) => m.score >= 80).length;
  const okCount = metrics.filter((m) => m.score >= 50 && m.score < 80).length;
  const poorCount = metrics.filter((m) => m.score < 50).length;

  // Filter
  const filtered = filter === "all"
    ? metrics
    : filter === "good"
    ? metrics.filter((m) => m.score >= 80)
    : filter === "ok"
    ? metrics.filter((m) => m.score >= 50 && m.score < 80)
    : metrics.filter((m) => m.score < 50);

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "url") cmp = a.url.localeCompare(b.url);
    else cmp = (a[sortKey] as number) - (b[sortKey] as number);
    return sortDir === "asc" ? cmp : -cmp;
  });

  const filterCounts: Record<ScoreFilter, number> = { all: metrics.length, good: goodCount, ok: okCount, poor: poorCount };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <SearchBar setDataValues={setData} />
      <div className="flex-1 overflow-auto p-4 max-w-6xl mx-auto w-full">
        {metrics.length > 0 ? (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div className={`border rounded-lg p-4 text-center ${scoreBg(avgScore)}`}>
                <p className={`text-2xl font-bold ${scoreColor(avgScore)}`}>{avgScore}</p>
                <p className="text-xs text-muted-foreground mt-1">Avg Score</p>
              </div>
              <div className="border rounded-lg p-4 text-center">
                <p className="text-2xl font-bold">{avgSize} KB</p>
                <p className="text-xs text-muted-foreground mt-1">Avg Page Size</p>
              </div>
              <div className="border rounded-lg p-4 text-center">
                <p className="text-2xl font-bold">{totalResources}</p>
                <p className="text-xs text-muted-foreground mt-1">Total Resources</p>
              </div>
              <div className="border rounded-lg p-4 text-center">
                <p className="text-2xl font-bold">{largest?.sizeKB} KB</p>
                <p className="text-xs text-muted-foreground mt-1">Largest Page</p>
              </div>
            </div>

            {/* Size Distribution Chart */}
            <h3 className="font-bold mb-3">Page Size Distribution</h3>
            <div className="mb-6 space-y-1">
              {sorted.slice(0, 20).map((m) => (
                <div key={m.url} className="flex items-center gap-2 text-xs">
                  <span className="w-40 truncate text-muted-foreground">{(() => { try { return new URL(m.url).pathname; } catch { return m.url; } })()}</span>
                  <div className="flex-1 h-4 bg-muted rounded overflow-hidden">
                    <div className={`h-full rounded ${m.score >= 80 ? "bg-green-500" : m.score >= 50 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${(m.sizeKB / maxSize) * 100}%` }} />
                  </div>
                  <span className="w-16 text-right">{m.sizeKB} KB</span>
                </div>
              ))}
            </div>

            {/* Download Controls */}
            <div className="flex items-center gap-2 mb-4">
              <Select value={exportFormat} onValueChange={(v) => setExportFormat(v as ExportFormat)}>
                <SelectTrigger className="w-[130px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="json">JSON</SelectItem>
                  <SelectItem value="csv">CSV</SelectItem>
                  <SelectItem value="markdown">Markdown</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => exportMetrics(metrics, exportFormat)}>
                Download All ({metrics.length})
              </Button>
              {filter !== "all" && sorted.length > 0 && (
                <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => exportMetrics(sorted, exportFormat)}>
                  Download Filtered ({sorted.length})
                </Button>
              )}
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-2 mb-4 flex-wrap">
              {([
                ["all", "All"],
                ["good", "Good (80+)"],
                ["ok", "OK (50-79)"],
                ["poor", "Poor (<50)"],
              ] as [ScoreFilter, string][]).map(([key, label]) => (
                <Button
                  key={key}
                  size="sm"
                  variant={filter === key ? "default" : "outline"}
                  onClick={() => setFilter(key)}
                  className="text-xs"
                >
                  {label} ({filterCounts[key]})
                </Button>
              ))}
            </div>

            {/* Table */}
            {sorted.length === 0 ? (
              <div className="border rounded-lg p-8 text-center text-muted-foreground">
                No pages match the current filter.
              </div>
            ) : (
              <div className="border rounded-lg overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      {([
                        ["url", "URL", "text-left"],
                        ["sizeKB", "Size", "text-center"],
                        ["scripts", "Scripts", "text-center"],
                        ["stylesheets", "CSS", "text-center"],
                        ["images", "Images", "text-center"],
                        ["domElements", "DOM", "text-center"],
                        ["score", "Score", "text-center"],
                      ] as [SortKey, string, string][]).map(([key, label, align]) => (
                        <th
                          key={key}
                          className={`p-3 font-medium cursor-pointer hover:text-foreground transition-colors select-none ${align}`}
                          onClick={() => toggleSort(key)}
                        >
                          {label}<SortIcon active={sortKey === key} dir={sortDir} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((m) => (
                      <tr key={m.url} className="border-t hover:bg-muted/30 transition-colors">
                        <td className="p-3 max-w-xs">
                          <a href={m.url} target="_blank" rel="noreferrer" className="font-mono text-xs hover:text-primary hover:underline truncate block" title={m.url}>
                            {m.url}
                          </a>
                        </td>
                        <td className="p-3 text-center text-xs">{m.sizeKB} KB</td>
                        <td className="p-3 text-center text-xs">{m.scripts}</td>
                        <td className="p-3 text-center text-xs">{m.stylesheets}</td>
                        <td className="p-3 text-center text-xs">{m.images}</td>
                        <td className="p-3 text-center text-xs">{m.domElements}</td>
                        <td className="p-3 text-center">
                          <Badge variant={m.score >= 80 ? "default" : m.score >= 50 ? "secondary" : "destructive"}>
                            {m.score}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
            <svg
              height={64}
              width={64}
              viewBox="0 0 24 24"
              xmlSpace="preserve"
              xmlns="http://www.w3.org/2000/svg"
              className="fill-[#3bde77] opacity-30"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M1.5 1.5H7.5V7.5H1.5zM16.5 1.5H22.5V7.5H16.5zM1.5 16.5H7.5V22.5H1.5zM16.5 16.5H22.5V22.5H16.5zM7.5 3H16.5V6H7.5zM3 7.5H6V16.5H3zM7.5 6H8.25L18.75 16.5H16.5V18.75L6 8.25V7.5H7.5z"
              ></path>
            </svg>
            <h2 className="text-xl font-semibold text-muted-foreground">
              Spider Perf Runner
            </h2>
            <p className="text-sm text-muted-foreground max-w-md">
              Enter a website URL above to crawl and analyze page performance.
              Spider will measure page size, resource counts, DOM complexity,
              and generate a performance score.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
