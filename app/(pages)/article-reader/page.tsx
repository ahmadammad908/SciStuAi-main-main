'use client';
import Image from 'next/image';
import { useState, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import { Button } from '@/components/ui/button';
import { Sparkles, BookText, FileText, Menu, X, Share } from 'lucide-react';
import Link from 'next/link';
import ModeToggle from '@/components/mode-toggle';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

// Set up PDF.js worker
if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.js',
    import.meta.url
  ).toString();
}

interface Comment {
  id: string;
  text: string;
  isAI: boolean;
  timestamp: Date;
  position?: { x: number; y: number; width: number; height: number };
  pageNumber?: number;
  selectedText?: string;
}

interface Article {
  id: string;
  name: string;
  content: string;
  comments: Comment[];
  file: File;
  numPages?: number;
}

interface Folder {
  id: string;
  name: string;
  articles: Article[];
}

interface PDFViewerProps {
  article: Article;
  onCommentCreate: (comment: Comment) => void;
}

// Utility to calculate optimal popup position
const calculatePopupPosition = (
  selectionPosition: { x: number; y: number; width: number; height: number },
  containerRect: DOMRect,
  scrollLeft: number,
  scrollTop: number,
  pageOffset: number
) => {
  const popupWidth = 200;
  const popupHeight = 60;

  let x = selectionPosition.x + selectionPosition.width / 2;
  let y = selectionPosition.y + pageOffset - popupHeight - 10;

  const minX = 10;
  const maxX = containerRect.width - popupWidth - 10;
  x = Math.max(minX, Math.min(x, maxX));

  const minY = scrollTop + 10;
  const maxY = scrollTop + containerRect.height - popupHeight - 10;
  if (y < minY) {
    y = selectionPosition.y + pageOffset + selectionPosition.height + 10;
  }
  y = Math.max(minY, Math.min(y, maxY));

  return { x, y };
};

const PDFViewer = ({ article, onCommentCreate }: PDFViewerProps) => {
  const [selectedText, setSelectedText] = useState<string>('');
  const [selectionPosition, setSelectionPosition] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [numPages, setNumPages] = useState<number>(0);
  const [aiAnalysisPending, setAiAnalysisPending] = useState<boolean>(false);
  const [pendingComment, setPendingComment] = useState<Comment | null>(null);
  const [showCommentPopup, setShowCommentPopup] = useState<boolean>(false);
  const [showSelectionPopup, setShowSelectionPopup] = useState<boolean>(false);
  const [newCommentText, setNewCommentText] = useState<string>('');
  const [hoveredComment, setHoveredComment] = useState<Comment | null>(null);
  const [textSelectionError, setTextSelectionError] = useState<string | null>(null);
  const [manualCommentMode, setManualCommentMode] = useState<boolean>(false);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

  const allComments = pendingComment ? [...article.comments, pendingComment] : article.comments;

  useEffect(() => {
    const updateContainerWidth = () => {
      if (pdfContainerRef.current) {
        setContainerWidth(pdfContainerRef.current.offsetWidth);
      }
    };

    updateContainerWidth();
    window.addEventListener('resize', updateContainerWidth);
    return () => window.removeEventListener('resize', updateContainerWidth);
  }, []);

  useEffect(() => {
    console.log('All comments:', allComments);
  }, [allComments]);

  useEffect(() => {
    if (showCommentPopup && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showCommentPopup]);

  useEffect(() => {
    const container = pdfContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const scrollTop = container.scrollTop;
      let newPage = 1;

      pageRefs.current.forEach((page, index) => {
        if (page) {
          const pageTop = page.offsetTop;
          const pageBottom = pageTop + page.offsetHeight;
          if (scrollTop >= pageTop && scrollTop < pageBottom) {
            newPage = index + 1;
          }
        }
      });

      if (newPage !== currentPage) {
        setCurrentPage(newPage);
        console.log('Current page updated to:', newPage);
      }
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [currentPage, numPages]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(event.target as Node) &&
        showSelectionPopup
      ) {
        setShowSelectionPopup(false);
        setSelectedText('');
        setSelectionPosition(null);
        window.getSelection()?.removeAllRanges();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSelectionPopup]);

  const handleTextSelection = (event: React.MouseEvent) => {
    if (manualCommentMode || (popupRef.current && popupRef.current.contains(event.target as Node))) {
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.toString().trim() === '') {
      setSelectedText('');
      setSelectionPosition(null);
      setShowSelectionPopup(false);
      setTextSelectionError(
        'No text selected. This PDF may not contain selectable text (e.g., scanned document). Click "Add Manual Comment" to place a comment anywhere.'
      );
      return;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const container = pdfContainerRef.current;
    const pageElement = pageRefs.current[currentPage - 1];

    if (container && pageElement && rect.width > 0 && rect.height > 0) {
      const pageRect = pageElement.getBoundingClientRect();

      const position = {
        x: rect.left - pageRect.left,
        y: rect.top - pageRect.top,
        width: rect.width,
        height: rect.height,
      };

      setSelectionPosition(position);
      setSelectedText(selection.toString());
      setShowSelectionPopup(true);
      setTextSelectionError(null);
      console.log('Text selected:', selection.toString(), 'Position:', position, 'Page:', currentPage);
    } else {
      setSelectedText('');
      setSelectionPosition(null);
      setShowSelectionPopup(false);
      setTextSelectionError(
        'Unable to determine selection position. Click "Add Manual Comment" to place a comment anywhere.'
      );
    }
  };

  const handleManualCommentClick = (event: React.MouseEvent) => {
    if (!manualCommentMode || (popupRef.current && popupRef.current.contains(event.target as Node))) {
      return;
    }

    const container = pdfContainerRef.current;
    const pageElement = pageRefs.current[currentPage - 1];

    if (container && pageElement) {
      const pageRect = pageElement.getBoundingClientRect();

      const position = {
        x: event.clientX - pageRect.left,
        y: event.clientY - pageRect.top,
        width: 50,
        height: 20,
      };

      setSelectionPosition(position);
      setSelectedText('');
      setShowCommentPopup(true);
      setTextSelectionError(null);
      console.log('Manual comment position set:', position, 'Page:', currentPage);
    }
  };

  const toggleManualCommentMode = () => {
    setManualCommentMode(true);
    setTextSelectionError(null);
    setSelectedText('');
    setSelectionPosition(null);
    setShowSelectionPopup(false);
    window.getSelection()?.removeAllRanges();
    console.log('Manual comment mode enabled');
  };

  const handleAIAnalysisStart = async () => {
    if (!selectedText || !selectionPosition) return;

    const newComment: Comment = {
      id: uuidv4(),
      text: 'Analyzing...',
      isAI: true,
      timestamp: new Date(),
      position: selectionPosition,
      pageNumber: currentPage,
      selectedText,
    };

    setPendingComment(newComment);
    setAiAnalysisPending(true);
    setShowSelectionPopup(false);
    console.log('AI analysis started:', newComment);

    try {
      // Call the Gemini API via /api/analyze
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: selectedText }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch AI analysis');
      }

      const { analysis } = await response.json();

      // Update the pending comment with the Gemini analysis
      const updatedComment: Comment = {
        ...newComment,
        text: analysis,
      };

      setPendingComment(updatedComment);
      setNewCommentText(analysis); // Prefill the comment textarea
      setShowCommentPopup(true); // Show the comment popup for editing
      setAiAnalysisPending(false);
      console.log('Gemini AI analysis completed:', updatedComment);
    } catch (error) {
      console.error('Error during Gemini AI analysis:', error);
      const errorComment: Comment = {
        ...newComment,
        text: 'Failed to analyze text. Please try again.',
      };
      setPendingComment(errorComment);
      setNewCommentText('Failed to analyze text. Please try again.');
      setShowCommentPopup(true);
      setAiAnalysisPending(false);
    }
  };

  const handleFinalizeComment = (action: 'add' | 'regenerate' | 'cancel') => {
    switch (action) {
      case 'add':
        if (pendingComment) {
          onCommentCreate(pendingComment);
          console.log('AI comment added:', pendingComment);
        }
        break;
      case 'regenerate':
        handleAIAnalysisStart(); // Re-run AI analysis
        console.log('AI comment regenerating');
        break;
      case 'cancel':
        console.log('AI comment cancelled');
        break;
    }

    setAiAnalysisPending(false);
    setPendingComment(null);
    window.getSelection()?.removeAllRanges();
    setSelectedText('');
    setSelectionPosition(null);
    setTextSelectionError(null);
    setManualCommentMode(false);
    setShowSelectionPopup(false);
    setShowCommentPopup(false);
    setNewCommentText('');
  };

  const handleAddComment = () => {
    if (!selectedText || !selectionPosition) return;
    setShowCommentPopup(true);
    setShowSelectionPopup(false);
  };

  const handleSaveComment = () => {
    if (!newCommentText.trim() && !pendingComment) return;

    const commentToSave: Comment = pendingComment
      ? { ...pendingComment, text: newCommentText || pendingComment.text }
      : {
          id: uuidv4(),
          text: newCommentText,
          isAI: false,
          timestamp: new Date(),
          position: selectionPosition!,
          pageNumber: currentPage,
          selectedText: selectedText || undefined,
        };

    onCommentCreate(commentToSave);
    setShowCommentPopup(false);
    setNewCommentText('');
    setSelectedText('');
    setSelectionPosition(null);
    setPendingComment(null);
    window.getSelection()?.removeAllRanges();
    setManualCommentMode(false);
    setShowSelectionPopup(false);
    console.log('Comment saved:', commentToSave);
  };

  const handleCancelComment = () => {
    setShowCommentPopup(false);
    setNewCommentText('');
    setSelectedText('');
    setSelectionPosition(null);
    setPendingComment(null);
    window.getSelection()?.removeAllRanges();
    setTextSelectionError(null);
    setManualCommentMode(false);
    setShowSelectionPopup(false);
  };

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    pageRefs.current = Array(numPages).fill(null);
    console.log('PDF loaded with', numPages, 'pages');
  };

  const handleMouseEnterComment = (comment: Comment) => {
    setHoveredComment(comment);
    console.log('Hovered comment:', comment);
  };

  const handleMouseLeaveComment = () => {
    setHoveredComment(null);
  };

  const handlePopupClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <div className="flex h-[calc(100vh-72px)] relative">
      <div
        ref={pdfContainerRef}
        className="flex-1 overflow-auto relative box-border max-w-full max-h-[calc(100vh-72px)] p-4"
        onMouseUp={manualCommentMode ? handleManualCommentClick : handleTextSelection}
      >
        <Document
          file={article.file}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={<div className="p-4 text-center">Loading PDF...</div>}
          error={<div className="p-4 text-center text-red-500">Failed to load PDF.</div>}
        >
          {Array.from(new Array(numPages), (_, index) => {
            const pageNumber = index + 1;
            return (
              <div
                key={`page_${pageNumber}`}
                className="relative flex justify-center bg-white dark:bg-zinc-800 shadow-sm mb-4 mx-auto border border-zinc-200 dark:border-zinc-700 max-w-[800px]"
                ref={(el) => {
                  pageRefs.current[index] = el;
                }}
                onMouseUp={manualCommentMode ? handleManualCommentClick : handleTextSelection}
              >
                <Page
                  pageNumber={pageNumber}
                  width={containerWidth ? Math.min(containerWidth - 40, 800) : 600}
                  loading={<div className="p-4 text-center">Loading page {pageNumber}...</div>}
                  onLoadSuccess={() => console.log(`Page ${pageNumber} loaded`)}
                  className="pdf-page"
                />

                {allComments
                  .filter((comment) => comment.pageNumber === pageNumber && comment.position)
                  .map((comment) => (
                    <div
                      key={comment.id}
                      className={`absolute ${
                        hoveredComment?.id === comment.id ? 'bg-yellow-400' : 'bg-yellow-300'
                      } bg-opacity-50 border border-yellow-500 rounded-sm transition-colors duration-200`}
                      style={{
                        left: comment.position!.x,
                        top: comment.position!.y,
                        width: comment.position!.width,
                        height: comment.position!.height,
                        zIndex: 10,
                      }}
                      onMouseEnter={() => handleMouseEnterComment(comment)}
                      onMouseLeave={handleMouseLeaveComment}
                    />
                  ))}

                {selectedText && selectionPosition && currentPage === pageNumber && (
                  <div
                    className="absolute bg-blue-200 bg-opacity-50 border border-blue-400 rounded-sm transition-opacity duration-200"
                    style={{
                      left: selectionPosition.x,
                      top: selectionPosition.y,
                      width: selectionPosition.width,
                      height: selectionPosition.height,
                      zIndex: 15,
                    }}
                  />
                )}
              </div>
            );
          })}
        </Document>

        {manualCommentMode && (
          <div
            style={{
              position: 'absolute',
              top: '10px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 25,
            }}
          >
            <div className="bg-blue-100 text-blue-700 p-2 rounded shadow-lg max-w-sm">
              Click on the PDF to place a comment. Click Cancel to exit manual mode.
            </div>
          </div>
        )}

        {textSelectionError && (
          <div
            style={{
              position: 'absolute',
              top: '10px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 25,
            }}
          >
            <div className="bg-red-100 text-red-700 p-2 rounded shadow-lg max-w-sm flex items-center gap-2">
              <span>{textSelectionError}</span>
              <Button size="sm" onClick={toggleManualCommentMode}>
                Add Manual Comment
              </Button>
            </div>
          </div>
        )}

        {showSelectionPopup && selectedText && selectionPosition && !showCommentPopup && !aiAnalysisPending && !manualCommentMode && (
          <div
            ref={popupRef}
            style={{
              position: 'absolute',
              left: `${calculatePopupPosition(
                selectionPosition,
                pdfContainerRef.current!.getBoundingClientRect(),
                pdfContainerRef.current!.scrollLeft,
                pdfContainerRef.current!.scrollTop,
                pageRefs.current[currentPage - 1]?.offsetTop || 0
              ).x}px`,
              top: `${calculatePopupPosition(
                selectionPosition,
                pdfContainerRef.current!.getBoundingClientRect(),
                pdfContainerRef.current!.scrollLeft,
                pdfContainerRef.current!.scrollTop,
                pageRefs.current[currentPage - 1]?.offsetTop || 0
              ).y}px`,
              zIndex: 20,
            }}
            className="animate-fade-in"
          >
            <div className="flex gap-2 bg-white dark:bg-zinc-800 p-3 rounded-lg shadow-xl border dark:border-zinc-700 backdrop-blur-sm bg-opacity-90 dark:bg-opacity-90 transition-all duration-200 hover:shadow-2xl">
              <Button
                size="sm"
                onClick={handleAddComment}
                className="bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-md px-4 py-2 transition-colors duration-200"
              >
                Add Note
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={handleAIAnalysisStart}
                className="bg-green-500 hover:bg-green-600 text-white font-semibold rounded-md px-4 py-2 transition-colors duration-200"
              >
                AI Analysis
              </Button>
            </div>
          </div>
        )}

        {showCommentPopup && selectionPosition && (
          <div
            ref={popupRef}
            onClick={handlePopupClick}
            onMouseDown={handlePopupClick}
            style={{
              position: 'absolute',
              left: `${selectionPosition.x + selectionPosition.width / 2}px`,
              top: `${selectionPosition.y + (pageRefs.current[currentPage - 1]?.offsetTop || 0)}px`,
              transform: 'translate(-50%, -100%)',
              zIndex: 20,
            }}
            className="animate-fade-in"
          >
            <div className="bg-white dark:bg-zinc-800 p-4 rounded-lg shadow-xl border dark:border-zinc-700 w-72 backdrop-blur-sm bg-opacity-90 dark:bg-opacity-90">
              <Input
                ref={inputRef}
                value={newCommentText}
                onChange={(e) => setNewCommentText(e.target.value)}
                placeholder="Enter your comment"
                className="mb-3 border-zinc-300 dark:border-zinc-600 focus:ring-2 focus:ring-blue-500 rounded-md"
                onClick={handlePopupClick}
                onMouseDown={handlePopupClick}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleSaveComment}
                  className="bg-blue-500 hover:bg-blue-600 text-white rounded-md"
                >
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCancelComment}
                  className="border-zinc-300 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-md"
                >
                  Cancel
                </Button>
                {pendingComment && pendingComment.isAI && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleFinalizeComment('regenerate')}
                    className="bg-yellow-500 hover:bg-yellow-600 text-white rounded-md"
                  >
                    Regenerate
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {aiAnalysisPending && !showCommentPopup && selectionPosition && (
          <div
            style={{
              position: 'absolute',
              left: `${selectionPosition.x + selectionPosition.width / 2}px`,
              top: `${selectionPosition.y + (pageRefs.current[currentPage - 1]?.offsetTop || 0)}px`,
              transform: 'translate(-50%, -100%)',
              zIndex: 20,
            }}
            className="animate-fade-in"
          >
            <div className="flex gap-2 items-center bg-white dark:bg-zinc-800 p-3 rounded-lg shadow-xl border dark:border-zinc-700 backdrop-blur-sm bg-opacity-90 dark:bg-opacity-90">
              <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full"></div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleFinalizeComment('cancel')}
                className="border-zinc-300 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-md"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {hoveredComment && hoveredComment.position && (
          <div
            style={{
              position: 'absolute',
              left: `${hoveredComment.position.x + hoveredComment.position.width / 2}px`,
              top: `${
                hoveredComment.position.y +
                hoveredComment.position.height +
                (pageRefs.current[hoveredComment.pageNumber! - 1]?.offsetTop || 0) +
                5
              }px`,
              transform: 'translateX(-50%)',
              zIndex: 30,
            }}
            className="animate-fade-in"
          >
            <div className="bg-gray-800 text-white p-3 rounded-lg shadow-xl max-w-xs backdrop-blur-sm bg-opacity-90">
              <div className="text-xs text-gray-300 mb-1">
                {hoveredComment.isAI ? 'AI Analysis' : 'Your Note'}
              </div>
              <div className="text-sm">{hoveredComment.text}</div>
              {hoveredComment.selectedText && (
                <div className="mt-2 text-xs text-gray-300">
                  <div className="font-semibold">Selected Text:</div>
                  <div className="truncate">{hoveredComment.selectedText}</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default function ArticleReaderPage() {
  const [folders, setFolders] = useState<Folder[]>([
    { id: 'default', name: 'All in One Articles', articles: [] },
  ]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createFolder = () => {
    if (newFolderName.trim()) {
      setFolders((prev) => [
        ...prev,
        { id: uuidv4(), name: newFolderName, articles: [] },
      ]);
      setNewFolderName('');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedFolder) return;

    try {
      const newArticle: Article = {
        id: uuidv4(),
        name: file.name,
        content: '',
        comments: [],
        file,
      };

      setFolders((prev) =>
        prev.map((folder) =>
          folder.id === selectedFolder
            ? { ...folder, articles: [...folder.articles, newArticle] }
            : folder
        )
      );

      try {
        const preview = await readPDFContent(file);
        setFolders((prev) =>
          prev.map((folder) => ({
            ...folder,
            articles: folder.articles.map((article) =>
              article.id === newArticle.id ? { ...article, content: preview } : article
            ),
          }))
        );
      } catch (error) {
        console.error('Error generating preview:', error);
      }
    } catch (error) {
      console.error('Error handling PDF:', error);
    }
  };

  const readPDFContent = async (file: File): Promise<string> => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const text = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const text = e.target?.result as string;
          resolve(text.slice(0, 500) + '...');
        };
        reader.readAsText(file);
      });
      return text;
    } catch (error) {
      console.error('Error reading PDF:', error);
      return 'Could not extract text content';
    }
  };

  const handleCommentCreate = (comment: Comment) => {
    if (!selectedArticle) return;

    setFolders((prev) =>
      prev.map((folder) => ({
        ...folder,
        articles: folder.articles.map((article) =>
          article.id === selectedArticle.id
            ? { ...article, comments: [...article.comments, comment] }
            : article
        ),
      }))
    );

    setSelectedArticle((prev) =>
      prev ? { ...prev, comments: [...prev.comments, comment] } : prev
    );

    console.log('Comment created:', comment);
  };

  return (
    <div className="flex flex-col lg:flex-row h-screen dark:bg-black bg-white dark:text-white text-black">
      <div className="lg:w-64 border-b lg:border-b-0 lg:border-r dark:border-zinc-800 border-zinc-200 hidden md:block">
        <div className="p-4 space-y-2">
          <Link href="/" className="flex items-center gap-2 mb-6">
            <Image src="/favicon.ico" alt="SciStuAI" width={24} height={24} className="w-6 h-6" />
            <h1 className="text-lg font-semibold">ScistuAI</h1>
          </Link>

          <Link href="/homework-helper">
            <Button variant="ghost" className="w-full justify-start gap-2">
              <Sparkles className="w-4 h-4" />
              Homework Helper
            </Button>
          </Link>

          <Link href="/article-reader">
            <Button variant="secondary" className="w-full justify-start gap-2">
              <BookText className="w-4 h-4" />
              Article Reader
            </Button>
          </Link>

          <Link href="/humanize-ai">
            <Button variant="ghost" className="w-full justify-start gap-2">
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
        <header className="md:hidden flex items-center justify-between p-4 border-b dark:border-zinc-800 border-zinc-200">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
            <h2 className="text-lg font-medium truncate">Article Reader</h2>
            <Badge variant="outline" className="text-xs">
              PDF Viewer
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <ModeToggle />
            <Button variant="outline" size="sm" className="h-8 w-8 p-0">
              <Share className="w-4 h-4" />
            </Button>
          </div>
        </header>

        <header className="hidden lg:flex items-center justify-between p-4 border-b dark:border-zinc-800 border-zinc-200">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-medium">Article Reader</h2>
            <Badge variant="outline" className="text-xs">
              PDF Viewer
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <ModeToggle />
            <Button variant="outline" size="sm">
              <Share className="w-4 h-4 mr-2" /> Share
            </Button>
          </div>
        </header>

        {mobileMenuOpen && (
          <div className="lg:hidden bg-white dark:bg-black border-b dark:border-zinc-800 border-zinc-200">
            <div className="p-4 space-y-2">
              <Link href="/homework-helper" onClick={() => setMobileMenuOpen(false)}>
                <Button variant="ghost" className="w-full justify-start gap-2">
                  <Sparkles className="w-4 h-4" />
                  Homework Helper
                </Button>
              </Link>

              <Link href="/article-reader" onClick={() => setMobileMenuOpen(false)}>
                <Button variant="secondary" className="w-full justify-start gap-2">
                  <BookText className="w-4 h-4" />
                  Article Reader
                </Button>
              </Link>

              <Link href="/humanize-ai" onClick={() => setMobileMenuOpen(false)}>
                <Button variant="ghost" className="w-full justify-start gap-2">
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

        {selectedArticle ? (
          <div className="flex-1 p-6 overflow-hidden">
            <Button onClick={() => setSelectedArticle(null)} variant="ghost" className="mb-4">
              ← Back to Folder
            </Button>
            <div className="bg-white dark:bg-zinc-900 rounded-lg h-full">
              <h2 className="text-xl font-bold p-6 border-b dark:border-zinc-800">{selectedArticle.name}</h2>
              <PDFViewer article={selectedArticle} onCommentCreate={handleCommentCreate} />
            </div>
          </div>
        ) : selectedFolder ? (
          <div className="flex-1 p-6">
            <Button onClick={() => setSelectedFolder(null)} variant="ghost" className="mb-4">
              ← Back to Folders
            </Button>
            <div className="mb-6 flex items-center gap-4">
              <input
                type="file"
                ref={fileInputRef}
                accept="application/pdf"
                onChange={handleFileUpload}
                className="hidden"
                title="Upload PDF Article"
              />
              <Button onClick={() => fileInputRef.current?.click()}>Upload PDF Article</Button>
              <span className="text-sm text-zinc-500">
                {folders.find((f) => f.id === selectedFolder)?.articles.length} articles
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {folders
                .find((f) => f.id === selectedFolder)
                ?.articles.map((article) => (
                  <div
                    key={article.id}
                    onClick={() => setSelectedArticle(article)}
                    className="p-4 border rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer"
                  >
                    <h3 className="font-medium mb-2">{article.name}</h3>
                    <div className="text-sm text-zinc-500">{article.content.slice(0, 100)}...</div>
                    <div className="mt-2 text-xs text-zinc-400">{article.comments.length} comments</div>
                  </div>
                ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 p-6">
            <div className="max-w-3xl mx-auto space-y-6">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="New folder name"
                  className="flex-1 min-w-0 p-2 border rounded-lg"
                  onKeyDown={(e) => e.key === 'Enter' && createFolder()}
                />
                <Button onClick={createFolder} className="sm:w-auto w-full">
                  Create Folder
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {folders.map((folder) => (
                  <div
                    key={folder.id}
                    onClick={() => setSelectedFolder(folder.id)}
                    className="p-4 border rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer"
                  >
                    <h3 className="font-medium mb-2">{folder.name}</h3>
                    <div className="text-sm text-zinc-500">{folder.articles.length} articles</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};