'use client';
import Image from 'next/image';
import { useState, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Sparkles, BookText, FileText, Menu, X, Share, XCircle, Trash2, RotateCcw, MessageSquare, Brain, Upload, AlertCircle, FolderPlus } from 'lucide-react';
import Link from 'next/link';
import ModeToggle from '@/components/mode-toggle';
import { Badge } from '@/components/ui/badge';

// Set up PDF.js worker
if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.js',
    import.meta.url
  ).toString();
}

// Utility to convert data URL to File
const dataUrlToFile = (dataUrl: string, fileName: string, mimeType: string): File => {
  const byteString = atob(dataUrl.split(',')[1]);
  const arrayBuffer = new ArrayBuffer(byteString.length);
  const uint8Array = new Uint8Array(arrayBuffer);
  for (let i = 0; i < byteString.length; i++) {
    uint8Array[i] = byteString.charCodeAt(i);
  }
  return new File([arrayBuffer], fileName, { type: mimeType });
};

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
  fileDataUrl?: string;
  numPages?: number;
  timestamp?: Date;
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
  pageOffset: number,
  isMobile: boolean
) => {
  const popupWidth = 240; // Width of the popup
  const popupHeight = 60; // Height of the popup
  const offset = 10; // Space between selection and popup

  // Horizontal: Try to place the popup to the right of the selection
  let x = selectionPosition.x + selectionPosition.width + offset;

  // Check if the popup overflows on the right
  const maxX = containerRect.width - popupWidth - 10;
  if (x > maxX) {
    // Try placing it to the left of the selection
    x = selectionPosition.x - popupWidth - offset;
    // If left placement isn't possible, center it and clamp
    if (x < 10) {
      x = selectionPosition.x + selectionPosition.width / 2 - popupWidth / 2;
      x = Math.max(10, Math.min(x, maxX));
    }
  }

  // Vertical: Try to place the popup above the selection
  let y = selectionPosition.y + pageOffset - popupHeight - (isMobile ? 16 : 8);

  // Check if the popup overflows below the container
  const minY = scrollTop + 10;
  const maxY = scrollTop + containerRect.height - popupHeight - (isMobile ? 60 : 10);
  if (y + popupHeight > maxY) {
    // Place above the selection if it would overflow below
    y = selectionPosition.y + pageOffset - popupHeight - (isMobile ? 16 : 8);
  }
  if (y < minY) {
    // If above isn't possible, place below and clamp
    y = selectionPosition.y + pageOffset + selectionPosition.height + (isMobile ? 16 : 8);
    y = Math.max(minY, Math.min(y, maxY));
  }

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

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
    if (showCommentPopup && textareaRef.current) {
      textareaRef.current.focus();
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

  const handleTextSelection = (event: React.MouseEvent | React.TouchEvent) => {
    if (manualCommentMode || (popupRef.current && popupRef.current.contains(event.target as Node))) {
      return;
    }

    // Delay processing to allow mobile selection to stabilize
    setTimeout(() => {
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

      let position: { x: number; y: number; width: number; height: number } | null = null;

      if (container && pageElement && rect.width > 0 && rect.height > 0) {
        const pageRect = pageElement.getBoundingClientRect();
        position = {
          x: rect.left - pageRect.left,
          y: rect.top - pageRect.top,
          width: rect.width,
          height: rect.height,
        };
      } else if (event.type === 'touchend') {
        // Fallback for mobile: use touch coordinates
        const touch = (event as React.TouchEvent).changedTouches[0];
        if (container && pageElement) {
          const pageRect = pageElement.getBoundingClientRect();
          position = {
            x: touch.clientX - pageRect.left,
            y: touch.clientY - pageRect.top,
            width: 50, // Default size
            height: 20,
          };
        }
      }

      if (position) {
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
    }, 100); // Small delay for mobile selection
  };

  const handleManualCommentClick = (event: React.MouseEvent | React.TouchEvent) => {
    if (!manualCommentMode || (popupRef.current && popupRef.current.contains(event.target as Node))) {
      return;
    }

    const container = pdfContainerRef.current;
    const pageElement = pageRefs.current[currentPage - 1];

    if (container && pageElement) {
      const pageRect = pageElement.getBoundingClientRect();
      let clientX: number, clientY: number;

      if (event.type === 'touchend') {
        const touch = (event as React.TouchEvent).changedTouches[0];
        clientX = touch.clientX;
        clientY = touch.clientY;
      } else {
        clientX = (event as React.MouseEvent).clientX;
        clientY = (event as React.MouseEvent).clientY;
      }

      const position = {
        x: clientX - pageRect.left,
        y: clientY - pageRect.top,
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
      id: pendingComment?.id || uuidv4(),
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
    setNewCommentText('Analyzing...');
    setShowCommentPopup(true);
    console.log('AI analysis started:', newComment);

    try {
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

      const updatedComment: Comment = {
        ...newComment,
        text: analysis,
      };

      setPendingComment(updatedComment);
      setNewCommentText(analysis);
      setAiAnalysisPending(false);
      console.log('AI analysis completed:', updatedComment);
    } catch (error) {
      console.error('Error during AI analysis:', error);
      const errorComment: Comment = {
        ...newComment,
        text: 'Failed to analyze text. Please try again.',
      };
      setPendingComment(errorComment);
      setNewCommentText('Failed to analyze text. Please try again.');
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
        resetCommentState();
        break;
      case 'regenerate':
        console.log('AI comment regenerating');
        handleAIAnalysisStart();
        break;
      case 'cancel':
        console.log('AI comment cancelled');
        resetCommentState();
        break;
    }
  };

  const resetCommentState = () => {
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

  const handlePopupClick = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
  };

  const handleClearSelection = () => {
    setShowSelectionPopup(false);
    setSelectedText('');
    setSelectionPosition(null);
    window.getSelection()?.removeAllRanges();
  };

  return (
    <TooltipProvider>
      <div className="flex h-[calc(100vh-72px)] relative">
        <div
          ref={pdfContainerRef}
          className="flex-1 overflow-auto relative box-border max-w-full max-h-[calc(100vh-72px)] p-4"
          onMouseUp={handleTextSelection}
          onTouchEnd={handleTextSelection}
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
                  className="relative flex justify-center bg-white dark:bg-zinc-800 shadow-sm mb-4 mx-auto border border-zinc-200 dark:border-zinc-700 max-w-[800px] rounded-lg"
                  ref={(el) => {
                    pageRefs.current[index] = el;
                  }}
                  onMouseUp={manualCommentMode ? handleManualCommentClick : handleTextSelection}
                  onTouchEnd={manualCommentMode ? handleManualCommentClick : handleTextSelection}
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
                      <Tooltip key={comment.id}>
                        <TooltipTrigger asChild>
                          <div
                            className={`absolute ${
                              hoveredComment?.id === comment.id ? 'bg-yellow-400' : 'bg-yellow-300'
                            } bg-opacity-40 border border-yellow-500 rounded-sm transition-colors duration-200 hover:bg-yellow-400/50`}
                            style={{
                              left: comment.position!.x,
                              top: comment.position!.y,
                              width: comment.position!.width,
                              height: comment.position!.height,
                              zIndex: 10,
                            }}
                            onMouseEnter={() => handleMouseEnterComment(comment)}
                            onMouseLeave={handleMouseLeaveComment}
                            onTouchStart={() => handleMouseEnterComment(comment)}
                          />
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={
                                comment.isAI
                                  ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300'
                                  : 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300'
                              }
                            >
                              {comment.isAI ? 'AI Comment' : 'Your Note'}
                            </Badge>
                            <p className="text-sm">{comment.text.slice(0, 50)}...</p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    ))}

                  {selectedText && selectionPosition && currentPage === pageNumber && (
                    <div
                      className="absolute bg-blue-200 bg-opacity-40 border border-blue-400 rounded-sm transition-opacity duration-200"
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
                top: '12px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 25,
              }}
            >
              <Card className="bg-blue-50 dark:bg-blue-900/50 border-blue-200 dark:border-blue-700 p-3 rounded-lg shadow-md">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  Tap on the PDF to place a comment. Tap Cancel to exit.
                </p>
              </Card>
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
                  pageRefs.current[currentPage - 1]?.offsetTop || 0,
                  isMobile
                ).x}px`,
                top: `${calculatePopupPosition(
                  selectionPosition,
                  pdfContainerRef.current!.getBoundingClientRect(),
                  pdfContainerRef.current!.scrollLeft,
                  pdfContainerRef.current!.scrollTop,
                  pageRefs.current[currentPage - 1]?.offsetTop || 0,
                  isMobile
                ).y}px`,
                zIndex: 20,
              }}
              className="animate-in fade-in duration-200"
            >
              <Card className="p-2 shadow-lg border dark:border-zinc-700 bg-white dark:bg-zinc-800">
                <CardContent className="flex gap-2 p-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        onClick={handleAddComment}
                        onTouchStart={handleAddComment}
                        className="bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                      >
                        <MessageSquare className="w-4 h-4 mr-2" />
                        Add Note
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Add a manual note to this selection</p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={handleAIAnalysisStart}
                        onTouchStart={handleAIAnalysisStart}
                        className="bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors"
                      >
                        <Brain className="w-4 h-4 mr-2" />
                        AI Analysis
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Generate AI-powered analysis for this selection</p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={handleClearSelection}
                        onTouchStart={handleClearSelection}
                        className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                      >
                        <XCircle className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Clear selection</p>
                    </TooltipContent>
                  </Tooltip>
                </CardContent>
              </Card>
            </div>
          )}

          {showCommentPopup && selectionPosition && (
            <div
              ref={popupRef}
              onClick={handlePopupClick}
              onTouchStart={handlePopupClick}
              style={{
                position: 'absolute',
                left: `${calculatePopupPosition(
                  selectionPosition,
                  pdfContainerRef.current!.getBoundingClientRect(),
                  pdfContainerRef.current!.scrollLeft,
                  pdfContainerRef.current!.scrollTop,
                  pageRefs.current[currentPage - 1]?.offsetTop || 0,
                  isMobile
                ).x}px`,
                top: `${calculatePopupPosition(
                  selectionPosition,
                  pdfContainerRef.current!.getBoundingClientRect(),
                  pdfContainerRef.current!.scrollLeft,
                  pdfContainerRef.current!.scrollTop,
                  pageRefs.current[currentPage - 1]?.offsetTop || 0,
                  isMobile
                ).y}px`,
                zIndex: 20,
              }}
              className="animate-in fade-in duration-200"
            >
              <Card className="shadow-lg border dark:border-zinc-700 bg-white dark:bg-zinc-800">
                <CardContent className="p-4">
                  <Textarea
                    ref={textareaRef}
                    value={newCommentText}
                    onChange={(e) => setNewCommentText(e.target.value)}
                    placeholder="Enter your comment or AI analysis"
                    className="mb-3 min-h-[100px] resize-none border-zinc-300 dark:border-zinc-600 focus:ring-2 focus:ring-blue-500 rounded-md"
                    onClick={handlePopupClick}
                    onTouchStart={handlePopupClick}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleSaveComment}
                      onTouchStart={handleSaveComment}
                      className="bg-blue-600 hover:bg-blue-700 text-white rounded-md"
                    >
                      <MessageSquare className="w-4 h-4 mr-2" />
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleCancelComment}
                      onTouchStart={handleCancelComment}
                      className="hover:bg-red-400 bg-red-600 rounded-md"
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Cancel
                    </Button>
                    {pendingComment && pendingComment.isAI && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleFinalizeComment('regenerate')}
                        onTouchStart={() => handleFinalizeComment('regenerate')}
                        className="bg-yellow-600 hover:bg-yellow-700 text-white rounded-md"
                      >
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Regenerate
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {aiAnalysisPending && !showCommentPopup && selectionPosition && (
            <div
              style={{
                position: 'absolute',
                left: `${
                  calculatePopupPosition(
                    selectionPosition,
                    pdfContainerRef.current!.getBoundingClientRect(),
                    pdfContainerRef.current!.scrollLeft,
                    pdfContainerRef.current!.scrollTop,
                    pageRefs.current[currentPage - 1]?.offsetTop || 0,
                    isMobile
                  ).x
                }px`,
                top: `${
                  calculatePopupPosition(
                    selectionPosition,
                    pdfContainerRef.current!.getBoundingClientRect(),
                    pdfContainerRef.current!.scrollLeft,
                    pdfContainerRef.current!.scrollTop,
                    pageRefs.current[currentPage - 1]?.offsetTop || 0,
                    isMobile
                  ).y
                }px`,
                zIndex: 20,
              }}
              className="animate-in fade-in duration-200"
            >
              <Card className="p-2 shadow-lg border dark:border-zinc-700 bg-white dark:bg-zinc-800">
                <CardContent className="flex gap-2 items-center p-1">
                  <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full" />
                  <span className="text-sm text-zinc-600 dark:text-zinc-300">Analyzing...</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleFinalizeComment('cancel')}
                    onTouchStart={() => handleFinalizeComment('cancel')}
                    className="border-zinc-300 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-md"
                  >
                    Cancel
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}

          {hoveredComment && hoveredComment.position && (
            <div
              style={{
                position: 'absolute',
                left: `${hoveredComment.position.x + hoveredComment.position.width / 1}px`,
                top: `${
                  hoveredComment.position.y +
                  hoveredComment.position.height +
                  (pageRefs.current[hoveredComment.pageNumber! - 1]?.offsetTop || 0) + 10
                }px`,
                transform: 'translateX(-10%)',
                zIndex: 30,
                maxWidth: '300px',
              }}
              className="animate-in fade-in duration-200"
            >
              <Card className="shadow-md border dark:border-zinc-700 bg-white dark:bg-zinc-800">
                <CardContent className="p-3">
                  <div className="mb-2">
                    <Badge
                      variant="outline"
                      className={
                        hoveredComment.isAI
                          ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300'
                          : 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300'
                      }
                    >
                      {hoveredComment.isAI ? 'AI Comment' : 'Your Note'}
                    </Badge>
                  </div>
                  <p className="text-sm text-zinc-800 dark:text-zinc-200">{hoveredComment.text}</p>
                  {hoveredComment.selectedText && (
                    <div className="mt-2">
                      <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                        Selected Text:
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                        {hoveredComment.selectedText.length > 100
                          ? `${hoveredComment.selectedText.slice(0, 100)}...`
                          : hoveredComment.selectedText}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
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

  // Load folders from localStorage after mount
  useEffect(() => {
    const savedFolders = localStorage.getItem('folders');
    if (savedFolders) {
      try {
        const parsedFolders: Folder[] = JSON.parse(savedFolders);
        const loadedFolders = parsedFolders.map((folder) => ({
          ...folder,
          articles: folder.articles.map((article) => ({
            ...article,
            file: dataUrlToFile(article.fileDataUrl!, article.name, 'application/pdf'),
            timestamp: new Date(article.timestamp || Date.now()),
            comments: article.comments.map((comment) => ({
              ...comment,
              timestamp: new Date(comment.timestamp),
            })),
          })),
        }));
        setFolders(loadedFolders);
      } catch (error) {
        console.error('Error parsing localStorage:', error);
      }
    }
  }, []);

  // Save folders to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('folders', JSON.stringify(folders));
  }, [folders]);

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
      // Convert file to data URL for persistence
      const fileDataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });

      const newArticle: Article = {
        id: uuidv4(),
        name: file.name,
        content: '',
        comments: [],
        file,
        fileDataUrl,
        timestamp: new Date(),
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

  const handleDeleteArticle = (articleId: string) => {
    setFolders((prev) =>
      prev.map((folder) =>
        folder.id === selectedFolder
          ? {
              ...folder,
              articles: folder.articles.filter((article) => article.id !== articleId),
            }
          : folder
      )
    );
    if (selectedArticle?.id === articleId) {
      setSelectedArticle(null);
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
              <Button onClick={() => fileInputRef.current?.click()}>
                <Upload className="w-4 h-4 mr-2" />
                Upload PDF Article
              </Button>
              <span className="text-sm text-zinc-500">
                {folders.find((f) => f.id === selectedFolder)?.articles.length} articles
              </span>
            </div>
            {folders.find((f) => f.id === selectedFolder)?.articles.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64">
                <AlertCircle className="w-12 h-12 text-zinc-400 mb-4" />
                <p className="text-lg text-zinc-500">No articles yet. Please upload.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {folders
                  .find((f) => f.id === selectedFolder)
                  ?.articles.map((article) => (
                    <div
                      key={article.id}
                      className="p-4 border rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 relative group"
                    >
                      <div
                        onClick={() => setSelectedArticle(article)}
                        className="cursor-pointer"
                      >
                        <h3 className="font-medium mb-2">{article.name}</h3>
                        <div className="text-sm text-zinc-500">{article.content.slice(0, 100)}...</div>
                        <div className="mt-2 text-xs text-zinc-400">{article.comments.length} comments</div>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-700 dark:hover:text-red-400"
                        onClick={() => handleDeleteArticle(article.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 p-6">
            <div className="max-w-3xl mx-auto space-y-6">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="New folder name"
                  className="flex-1 min-w-0 p-2 border rounded-lg dark:bg-zinc-800 dark:border-zinc-600"
                  onKeyDown={(e) => e.key === 'Enter' && createFolder()}
                />
                <Button onClick={createFolder} className="sm:w-auto w-full">
                  <FolderPlus className="w-4 h-4 mr-2" />
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