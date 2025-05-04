"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import { Button } from "@/components/ui/button";
import Head from "next/head";
import Link from "next/link";
import ModeToggle from "@/components/mode-toggle";
import { Badge } from "@/components/ui/badge";
import { Share, Sparkles, Copy, BookText, FileText, Menu, X, Check, Download, Search, BarChart2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import Prism from "prismjs";
import "prismjs/themes/prism-okaidia.css";
import "prismjs/components/prism-markdown";
import "@/styles/page.css";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import debounce from "lodash/debounce";
import Chart from "chart.js/auto";
import io from "socket.io-client";

interface HumanizeResult {
  id: string;
  originalText: string;
  humanizedText: string;
  timestamp: Date;
  favorite?: boolean;
}

interface AnalyticsData {
  totalHumanizations: number;
  averageWordCount: number;
}

export default function HumanizeAIPage() {
  const [humanizeText, setHumanizeText] = useState<string>("");
  const [humanizedResults, setHumanizedResults] = useState<HumanizeResult[]>([]);
  const [isHumanizing, setIsHumanizing] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [requests, setRequests] = useState<number[]>([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [streamedText, setStreamedText] = useState<string>("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [previewCopied, setPreviewCopied] = useState(false);
  const [exportFormat, setExportFormat] = useState<"text" | "markdown" | "html" | "pdf" | "json">("markdown");
  const [historySearch, setHistorySearch] = useState<string>("");
  const [showFavoritesOnly, setShowFavoritesOnly] = useState<boolean>(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [theme, setTheme] = useState<"default" | "blue" | "green" | "purple">("default");
  const [showAnalytics, setShowAnalytics] = useState<boolean>(false);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData>({ totalHumanizations: 0, averageWordCount: 0 });

  const chartRef = useRef<Chart | null>(null); // Store chart instance
  const RATE_LIMIT = 5;
  const RATE_LIMIT_WINDOW = 60 * 1000;

  // Mock WebSocket for real-time collaboration
  useEffect(() => {
    const socket = io("http://localhost:3001"); // Replace with actual WebSocket server
    socket.on("textUpdate", (data: { text: string }) => {
      setHumanizeText(data.text);
    });
    return () => {
      socket.disconnect();
    };
  }, []);

  // Load history from local storage on mount
  useEffect(() => {
    const savedResults = localStorage.getItem("humanizedResults");
    if (savedResults) {
      setHumanizedResults(JSON.parse(savedResults, (key, value) => {
        if (key === "timestamp") return new Date(value);
        return value;
      }));
    }
  }, []);

  // Save history to local storage on update
  useEffect(() => {
    localStorage.setItem("humanizedResults", JSON.stringify(humanizedResults));
  }, [humanizedResults]);

  // Syntax highlighting
  useEffect(() => {
    Prism.highlightAll();
  }, [streamedText, humanizedResults]);

  // Update analytics data and chart
  useEffect(() => {
    const totalHumanizations = humanizedResults.length;
    const totalWords = humanizedResults.reduce((sum, result) => sum + result.humanizedText.split(/\s+/).length, 0);
    const averageWordCount = totalHumanizations ? totalWords / totalHumanizations : 0;
    setAnalyticsData({ totalHumanizations, averageWordCount });

    if (showAnalytics) {
      const ctx = document.getElementById("analyticsChart") as HTMLCanvasElement;
      if (ctx) {
        // Destroy existing chart if it exists
        if (chartRef.current) {
          chartRef.current.destroy();
        }

        // Create new chart
        chartRef.current = new Chart(ctx, {
          type: "bar",
          data: {
            labels: ["Total Humanizations", "Average Word Count"],
            datasets: [{
              label: "Analytics",
              data: [totalHumanizations, averageWordCount],
              backgroundColor: ["#3b82f6", "#10b981"],
            }],
          },
          options: { scales: { y: { beginAtZero: true } } },
        });
      }
    }

    // Cleanup: Destroy chart on unmount or when dependencies change
    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
      }
    };
  }, [humanizedResults, showAnalytics]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "Enter") handleHumanize();
      if (e.ctrlKey && e.key === "c") handleCopy(streamedText || humanizedResults[0]?.humanizedText || "");
      if (e.ctrlKey && e.key === "e") handleExport(streamedText || humanizedResults[0]?.humanizedText || "");
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [humanizeText, streamedText, humanizedResults]);

  // Fetch AI-powered text suggestions
  const fetchSuggestions = useCallback(
    debounce(async (text: string) => {
      if (!text.trim()) {
        setSuggestions([]);
        return;
      }
      try {
        // Mock advanced AI suggestion logic
        const generateSuggestions = (input: string): string[] => {
          const words = input.split(/\s+/);
          const wordCount = words.length;
          const isShort = wordCount < 10;

          // Synonym mapping for dynamic word replacement
          const synonyms: { [key: string]: string[] } = {
            good: ["great", "awesome", "fantastic"],
            bad: ["poor", "terrible", "awful"],
            make: ["create", "build", "craft"],
            think: ["believe", "consider", "ponder"],
          };

          // Helper to replace words with synonyms
          const replaceWithSynonyms = (text: string) => {
            return words
              .map((word) => {
                const lowerWord = word.toLowerCase();
                return synonyms[lowerWord] ? synonyms[lowerWord][Math.floor(Math.random() * synonyms[lowerWord].length)] : word;
              })
              .join(" ");
          };

          // 1. Conversational Rewrite (Casual and engaging)
          const conversational = isShort
            ? `Hey, check this out: ${input.toLowerCase().replace(/\.$/, "")}! Sounds cool, right?`
            : `So, here's a chill take: ${replaceWithSynonyms(input).toLowerCase().replace(/\.$/, "")}... what do you think?`;

          // 2. Formal Enhancement (Professional tone)
          const formal = `In a professional context, one might express this as: ${
            isShort ? input : input.replace(/\b(is|are)\b/g, "constitutes").replace(/\bgood\b/g, "exceptional")
          }.`;

          // 3. Creative Flair (Poetic or storytelling style)
          const creative = `Imagine this woven into a tale: Once upon a time, ${
            replaceWithSynonyms(input).replace(/\bthe\b/g, "a legendary").replace(/\.$/, "")
          }, sparking wonder in all who heard it!`;

          return [conversational, formal, creative];
        };

        // Simulate API delay
        const response = await new Promise<string[]>((resolve) =>
          setTimeout(() => resolve(generateSuggestions(text)), 500)
        );
        setSuggestions(response);
      } catch (err) {
        toast.error("Failed to fetch suggestions");
      }
    }, 500),
    []
  );

  useEffect(() => {
    fetchSuggestions(humanizeText);
  }, [humanizeText, fetchSuggestions]);

  const handleCopy = (text: string, id?: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Text copied to clipboard!");
    if (id) {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } else {
      setPreviewCopied(true);
      setTimeout(() => setPreviewCopied(false), 2000);
    }
  };

  const handleExport = async (text: string) => {
    let content = text;
    let extension = "txt";
    let mimeType = "text/plain";

    switch (exportFormat) {
      case "html":
        content = `<div class="humanized-content">${formatHumanizedText(text)}</div>`;
        extension = "html";
        mimeType = "text/html";
        break;
      case "markdown":
        extension = "md";
        mimeType = "text/markdown";
        break;
      case "text":
        content = text.replace(/[#*>\-`]+/g, "");
        break;
      case "pdf":
        const doc = new jsPDF();
        const previewElement = document.querySelector(".styled-text") as HTMLElement;
        if (previewElement) {
          const canvas = await html2canvas(previewElement);
          const imgData = canvas.toDataURL("image/png");
          doc.addImage(imgData, "PNG", 10, 10, 190, 0);
          doc.text("Humanized Text", 10, 10);
          doc.save(`humanized-text-${new Date().toISOString()}.pdf`);
        } else {
          doc.text(text, 10, 10);
          doc.save(`humanized-text-${new Date().toISOString()}.pdf`);
        }
        toast.success("PDF exported successfully!");
        return;
      case "json":
        content = JSON.stringify({ text, timestamp: new Date().toISOString() }, null, 2);
        extension = "json";
        mimeType = "application/json";
        break;
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `humanized-text-${new Date().toISOString()}.${extension}`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${exportFormat.toUpperCase()} exported successfully!`);
  };

  const handleHumanize = async () => {
    if (!humanizeText.trim()) {
      toast.error("Please enter text to humanize");
      return;
    }

    try {
      setIsHumanizing(true);
      setError("");
      setStreamedText("");

      const now = Date.now();
      const recentRequests = requests.filter((ts) => ts > now - RATE_LIMIT_WINDOW);
      if (recentRequests.length >= RATE_LIMIT) {
        throw new Error(`Rate limit exceeded: ${RATE_LIMIT} requests per minute`);
      }

      const response = await fetch("/api/humanize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: humanizeText }),
      });

      if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let resultText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        resultText += chunk;
        setStreamedText(resultText);
      }

      const newResult = {
        id: uuidv4(),
        originalText: humanizeText,
        humanizedText: resultText,
        timestamp: new Date(),
        favorite: false,
      };

      setHumanizedResults((prev) => [newResult, ...prev]);
      setHumanizeText("");
      setRequests((prev) => [...prev, now]);
      toast.success("Text humanized successfully!");

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to humanize text";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsHumanizing(false);
    }
  };

  const formatHumanizedText = useCallback((text: string) => {
    if (!text) return text;

    return text
      .replace(/^#\s(.+)$/gm, '<h1 class="text-2xl font-bold text-red-500 mt-6 mb-4">$1</h1>')
      .replace(/^##\s(.+)$/gm, '<h2 class="text-xl font-semibold text-emerald-500 mt-5 mb-3">$1</h2>')
      .replace(/^###\s(.+)$/gm, '<h3 class="text-lg font-medium text-blue-500 mt-4 mb-2">$1</h3>')
      .replace(/\*\*(.+?)\*\*/g, '<strong class="font-bold">$1</strong>')
      .replace(/\*(.+?)\*/g, '<em class="italic">$1</em>')
      .replace(/`(.+?)`/g, '<code class="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">$1</code>')
      .replace(/^\-\s(.+)$/gm, '<li class="ml-6 list-disc">$1</li>')
      .replace(/^\d+\.\s(.+)$/gm, '<li class="ml-6 list-decimal">$1</li>')
      .replace(/\n\n/g, '</p><p class="my-4 leading-relaxed">')
      .replace(/\n/g, '<br>')
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" class="text-blue-500 hover:underline" target="_blank" rel="noopener noreferrer">$1</a>')
      .replace(/^>\s(.+)$/gm, '<blockquote class="border-l-4 border-gray-300 pl-4 italic text-gray-600 dark:text-gray-400">$1</blockquote>');
  }, []);

  const toggleFavorite = (id: string) => {
    setHumanizedResults((prev) =>
      prev.map((result) =>
        result.id === id ? { ...result, favorite: !result.favorite } : result
      )
    );
    toast.success("Favorite status updated!");
  };

  const deleteHistoryItem = (id: string) => {
    setHumanizedResults((prev) => prev.filter((result) => result.id !== id));
    toast.success("History item deleted!");
  };

  const filteredResults = useMemo(() => {
    return humanizedResults.filter((result) => {
      const matchesSearch =
        result.originalText.toLowerCase().includes(historySearch.toLowerCase()) ||
        result.humanizedText.toLowerCase().includes(historySearch.toLowerCase());
      const matchesFavorite = showFavoritesOnly ? result.favorite : true;
      return matchesSearch && matchesFavorite;
    });
  }, [humanizedResults, historySearch, showFavoritesOnly]);

  const HumanizedPreview = ({ result }: { result?: HumanizeResult }) => {
    const textToDisplay = result?.humanizedText || streamedText || "";
    const formattedText = textToDisplay
      ? formatHumanizedText(textToDisplay)
      : '<p class="text-gray-500 dark:text-gray-400">Humanized text will appear here</p>';

    return (
      <div className="relative border rounded-lg p-6 bg-white dark:bg-zinc-900 h-80 shadow-lg ">
        <div className="absolute top-2 right-4 flex gap-2 ">
          <select
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value as "text" | "markdown" | "html" | "pdf" | "json")}
            className="text-sm border rounded-md px-2 py-1 bg-white dark:bg-zinc-800"
            aria-label="Select export format"
          >
            <option value="markdown">Markdown</option>
            <option value="html">HTML</option>
            <option value="text">Plain Text</option>
            <option value="pdf">PDF</option>
            <option value="json">JSON</option>
          </select>
          {(result || streamedText) && !isHumanizing && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleCopy(textToDisplay)}
                className="h-8"
                aria-label="Copy humanized text"
              >
                {previewCopied ? (
                  <Check className="w-4 h-4 mr-2 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4 mr-2" />
                )}
                {previewCopied ? "Copied!" : "Copy"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleExport(textToDisplay)}
                className="h-8"
                aria-label="Export humanized text"
              >
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </>
          )}
        </div>
        <div
          className="text-sm whitespace-pre-wrap h-full overflow-y-auto pr-12 styled-text prose dark:prose-invert"
          dangerouslySetInnerHTML={{ __html: formattedText }}
        />
        {textToDisplay && (
          <div className="mt-2 text-xs text-gray-400">
            Character count: {textToDisplay.length} | Word count: {textToDisplay.split(/\s+/).length}
          </div>
        )}
      </div>
    );
  };

  const HistoryItem = ({ result }: { result: HumanizeResult }) => (
    <div className="group relative border rounded-lg p-6 bg-zinc-50 dark:bg-zinc-800 shadow-sm hover:shadow-md transition-shadow">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h4 className="text-sm font-medium mb-2">Original</h4>
          <p className="text-sm text-zinc-600 dark:text-zinc-300 line-clamp-3">
            {result.originalText}
          </p>
        </div>
        <div>
          <h4 className="text-sm font-medium mb-2">Humanized</h4>
          <div
            className="text-sm text-zinc-600 dark:text-zinc-300 line-clamp-3 styled-text prose dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: formatHumanizedText(result.humanizedText) }}
          />
        </div>
      </div>
      <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => toggleFavorite(result.id)}
          aria-label={result.favorite ? "Remove from favorites" : "Add to favorites"}
        >
          {result.favorite ? (
            <Sparkles className="w-4 h-4 text-yellow-500" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => handleCopy(result.humanizedText, result.id)}
          aria-label="Copy humanized text"
        >
          {copiedId === result.id ? (
            <Check className="w-4 h-4 text-green-500" />
          ) : (
            <Copy className="w-4 h-4" />
          )}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => handleExport(result.humanizedText)}
          aria-label="Export humanized text"
        >
          <Download className="w-4 h-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => deleteHistoryItem(result.id)}
          aria-label="Delete history item"
        >
          <X className="w-4 h-4 text-red-500" />
        </Button>
      </div>
      <div className="text-xs text-zinc-400 mt-4 flex justify-between">
        <span>{result.timestamp.toLocaleString()}</span>
        <span>Words: {result.humanizedText.split(/\s+/).length}</span>
      </div>
    </div>
  );

  return (
    <div className={`flex flex-col lg:flex-row h-screen dark:bg-black bg-white dark:text-white text-black theme-${theme}`}>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      </Head>
      <div className="hidden lg:block lg:w-64 border-b lg:border-b-0 lg:border-r dark:border-zinc-800 border-zinc-200">
        <div className="p-4 space-y-2">
          <Link href="/" className="flex items-center gap-2 mb-6">
            <h1 className="text-lg font-semibold">ScistuAI</h1>
          </Link>
          <Link href="/homework-helper">
            <Button variant="ghost" className="w-full justify-start gap-2">
              <Sparkles className="w-4 h-4" />
              Homework Helper
            </Button>
          </Link>
          <Link href="/article-reader">
            <Button variant="ghost" className="w-full justify-start gap-2">
              <BookText className="w-4 h-4" />
              Article Reader
            </Button>
          </Link>
          <Link href="/humanize-ai">
            <Button variant="secondary" className="w-full justify-start gap-2">
              <Sparkles className="w-4 h-4" />
              Humanize AI
            </Button>
          </Link>
          <Link href="/resume-analyzer">
            <Button variant="ghost" className="w-full justify-start gap-2">
              <FileText className="w-4 h-4" />
              Resume Analyzer
            </Button>
          </Link>
        </div>
      </div>
      <div className="flex-1 flex flex-col">
        <header className="flex items-center justify-between p-4 border-b dark:border-zinc-800 border-zinc-200">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden block"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
            <h2 className="text-lg font-medium capitalize truncate">Humanize AI</h2>
        
          </div>
          <div className="flex items-center gap-2">
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAnalytics(!showAnalytics)}
              aria-label="Toggle analytics"
            >
              <BarChart2 className="w-4 h-4" />
            </Button>
            <ModeToggle />
            <Button variant="outline" size="sm" className="h-8 w-8 p-0" aria-label="Share">
              <Share className="w-4 h-4" />
            </Button>
          </div>
        </header>
        {mobileMenuOpen && (
          <div className="lg:hidden p-4 border-b dark:border-zinc-800 border-zinc-200 bg-white dark:bg-black">
            <div className="space-y-2">
              <Link href="/homework-helper" onClick={() => setMobileMenuOpen(false)}>
                <Button variant="ghost" className="w-full justify-start gap-2">
                  <Sparkles className="w-4 h-4" />
                  Homework Helper
                </Button>
              </Link>
              <Link href="/article-reader" onClick={() => setMobileMenuOpen(false)}>
                <Button variant="ghost" className="w-full justify-start gap-2">
                  <BookText className="w-4 h-4" />
                  Article Reader
                </Button>
              </Link>
              <Link href="/humanize-ai" onClick={() => setMobileMenuOpen(false)}>
                <Button variant="secondary" className="w-full justify-start gap-2">
                  <Sparkles className="w-4 h-4" />
                  Humanize AI
                </Button>
              </Link>
              <Link href="/resume-analyzer" onClick={() => setMobileMenuOpen(false)}>
                <Button variant="ghost" className="w-full justify-start gap-2">
                  <FileText className="w-4 h-4" />
                  Resume Analyzer
                </Button>
              </Link>
            </div>
          </div>
        )}
        <div className="flex-1 p-6 overflow-auto">
          <div className="max-w-4xl mx-auto space-y-6">
            {error && (
              <div className="bg-red-100 dark:bg-red-900 p-3 rounded-lg text-red-700 dark:text-red-200">
                {error}
              </div>
            )}
            {showAnalytics && (
              <div className="border rounded-lg p-6 bg-white dark:bg-zinc-900 shadow-lg">
                <h3 className="text-lg font-semibold mb-4">Analytics</h3>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-zinc-600 dark:text-zinc-300">Total Humanizations</p>
                    <p className="text-lg font-bold">{analyticsData.totalHumanizations}</p>
                  </div>
                  <div>
                    <p className="text-sm text-zinc-600 dark:text-zinc-300">Average Word Count</p>
                    <p className="text-lg font-bold">{Math.round(analyticsData.averageWordCount)}</p>
                  </div>
                </div>
                <canvas id="analyticsChart" className="w-full h-64"></canvas>
              </div>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Original Text</h3>
                <Textarea
                  value={humanizeText}
                  onChange={(e) => setHumanizeText(e.target.value)}
                  placeholder="Paste your AI-generated text here..."
                  className="h-64 text-base"
                  disabled={isHumanizing}
                  aria-label="Original text input"
                />
                {suggestions.length > 0 && (
                  <div className="text-sm text-zinc-500">
                    <h4 className="font-medium mb-2">Suggestions:</h4>
                    <ul className="list-disc ml-6">
                      {suggestions.map((suggestion, index) => (
                        <li
                          key={index}
                          className="cursor-pointer hover:text-blue-500"
                          onClick={() => setHumanizeText(suggestion)}
                        >
                          {suggestion}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <Button
                  onClick={handleHumanize}
                  disabled={isHumanizing || !humanizeText.trim()}
                  className="w-full"
                  aria-label="Humanize text"
                >
                  {isHumanizing ? (
                    <>
                      <svg
                        className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      Processing...
                    </>
                  ) : (
                    "Humanize Text"
                  )}
                </Button>
              </div>
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Humanized Version</h3>
                <HumanizedPreview result={humanizedResults[0]} />
              </div>
            </div>
            <div className="text-sm text-zinc-500 text-center">
              Requests this minute: {requests.filter((t) => t > Date.now() - RATE_LIMIT_WINDOW).length}/{RATE_LIMIT}
            </div>
            {humanizedResults.length > 0 && (
              <div className="border-t dark:border-zinc-800 pt-6">
                <h3 className="text-lg font-semibold mb-4">History</h3>
                <div className="flex gap-4 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <Input
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      placeholder="Search history..."
                      className="pl-10"
                      aria-label="Search history"
                    />
                  </div>
                  <Button
                    variant={showFavoritesOnly ? "secondary" : "outline"}
                    onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                    aria-label={showFavoritesOnly ? "Show all history" : "Show favorites only"}
                  >
                    {showFavoritesOnly ? "Show All" : "Favorites Only"}
                  </Button>
                </div>
                <div className="space-y-4">
                  {filteredResults.length > 0 ? (
                    filteredResults.map((result) => (
                      <HistoryItem key={result.id} result={result} />
                    ))
                  ) : (
                    <p className="text-zinc-500 text-center">No results found.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}