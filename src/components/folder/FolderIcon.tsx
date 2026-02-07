'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { MoreVertical, Pencil, Trash2, FolderOpen, FileText, Calendar, Folder } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FolderWithStats, WorkspaceFolder } from '@/types/database';

// Unified blue folder color
const folderColorPalette = [
  { main: '#2563eb', light: '#3b82f6' }, // Blue
];

// Get color palette for a folder
function getFolderPalette(color: string | null | undefined) {
  if (!color) return folderColorPalette[0];
  const found = folderColorPalette.find(p => p.main === color);
  if (found) return found;
  // Generate a lighter version for custom colors
  return { main: color, light: color };
}

// Custom styled folder SVG component with depth effect
function StyledFolder({ color, lightColor, className }: { color: string; lightColor: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 64 52"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Back flap (darker) */}
      <path
        d="M4 8C4 5.79086 5.79086 4 8 4H24L28 10H56C58.2091 10 60 11.7909 60 14V44C60 46.2091 58.2091 48 56 48H8C5.79086 48 4 46.2091 4 44V8Z"
        fill={color}
        fillOpacity="0.9"
      />
      {/* Front face (lighter, with gradient effect) */}
      <path
        d="M4 16C4 13.7909 5.79086 12 8 12H56C58.2091 12 60 13.7909 60 16V44C60 46.2091 58.2091 48 56 48H8C5.79086 48 4 46.2091 4 44V16Z"
        fill={lightColor}
        fillOpacity="0.95"
      />
      {/* Subtle highlight on top edge */}
      <path
        d="M8 12H56C58.2091 12 60 13.7909 60 16V18H4V16C4 13.7909 5.79086 12 8 12Z"
        fill="white"
        fillOpacity="0.15"
      />
      {/* Tab shadow */}
      <path
        d="M24 4H8C5.79086 4 4 5.79086 4 8V10H26L24 4Z"
        fill={color}
        fillOpacity="0.7"
      />
    </svg>
  );
}

interface FolderIconProps {
  folder: WorkspaceFolder | FolderWithStats;
  documentCount?: number;
  subfolderCount?: number;
  onOpen: () => void;
  onRename?: () => void;
  onDelete?: () => void;
  isDragOver?: boolean;
  isDragging?: boolean;
}

export function FolderIcon({
  folder,
  documentCount = 0,
  subfolderCount = 0,
  onOpen,
  onRename,
  onDelete,
  isDragOver = false,
  isDragging = false,
}: FolderIconProps) {
  const t = useTranslations('folders');
  const tCommon = useTranslations('common');
  const [showMenu, setShowMenu] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  // Get stats from FolderWithStats if available
  const docCount = 'document_count' in folder ? folder.document_count : documentCount;
  const folderCount = 'subfolder_count' in folder ? folder.subfolder_count : subfolderCount;
  const totalItems = docCount + folderCount;

  // Get folder color palette
  const palette = getFolderPalette(folder.color);

  return (
    <div className="relative group">
      {/* Main folder button */}
      <button
        onClick={onOpen}
        onContextMenu={(e) => {
          e.preventDefault();
          setShowInfo(true);
        }}
        className={cn(
          'flex flex-col items-center gap-2 p-3 rounded-xl transition-all duration-200',
          'hover:bg-surface-alt/60 hover:shadow-md active:scale-95',
          'w-[130px] focus:outline-none focus:ring-2 focus:ring-accent/50',
          isDragOver && 'bg-accent/10 ring-2 ring-accent scale-105 shadow-lg',
          isDragging && 'opacity-50'
        )}
      >
        {/* Folder icon with badge */}
        <div className="relative drop-shadow-sm">
          <StyledFolder
            color={palette.main}
            lightColor={palette.light}
            className="w-20 h-[72px] transition-transform group-hover:scale-105"
          />
          
          {/* Item count badge */}
          {totalItems > 0 && (
            <span
              className="absolute -top-1.5 -right-1.5 min-w-[22px] h-[22px] px-1.5 flex items-center justify-center text-[11px] font-bold text-white rounded-full shadow-sm ring-2 ring-surface"
              style={{ backgroundColor: palette.main }}
            >
              {totalItems > 99 ? '99+' : totalItems}
            </span>
          )}
        </div>

        {/* Folder name */}
        <span className="text-xs font-medium text-text text-center line-clamp-2 leading-tight max-w-full px-1">
          {folder.name}
        </span>
      </button>

      {/* Menu button (visible on hover) */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setShowMenu(!showMenu);
        }}
        className={cn(
          'absolute top-1 right-1 p-1.5 rounded-lg transition-all',
          'opacity-0 group-hover:opacity-100 hover:bg-surface-alt/80 hover:shadow-sm',
          showMenu && 'opacity-100 bg-surface-alt'
        )}
      >
        <MoreVertical className="w-4 h-4 text-text-soft" />
      </button>

      {/* Dropdown menu */}
      {showMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowMenu(false)}
          />
          <div className="absolute right-0 top-10 w-44 bg-surface border border-border rounded-xl shadow-xl z-50 overflow-hidden animate-fade-in">
            <button
              onClick={() => {
                setShowMenu(false);
                onOpen();
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-text hover:bg-surface-alt transition-colors"
            >
              <FolderOpen className="w-4 h-4 text-text-soft" />
              {t('openFolder')}
            </button>
            
            {onRename && (
              <button
                onClick={() => {
                  setShowMenu(false);
                  onRename();
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-text hover:bg-surface-alt transition-colors"
              >
                <Pencil className="w-4 h-4 text-text-soft" />
                {tCommon('rename')}
              </button>
            )}
            
            {onDelete && (
              <>
                <hr className="border-border my-1" />
                <button
                  onClick={() => {
                    setShowMenu(false);
                    onDelete();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-error hover:bg-error/10 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  {tCommon('delete')}
                </button>
              </>
            )}
          </div>
        </>
      )}

      {/* Info sheet (on long press / right click) */}
      {showInfo && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/50 animate-fade-in"
            onClick={() => setShowInfo(false)}
          />
          <div className="fixed inset-x-4 bottom-4 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[400px] bg-surface rounded-2xl shadow-2xl z-50 animate-slide-up overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <span className="text-sm font-medium text-text-soft">{t('folder')}</span>
              <button
                onClick={() => setShowInfo(false)}
                className="text-sm font-semibold text-accent hover:text-accent/80 transition-colors"
              >
                {tCommon('done')}
              </button>
            </div>

            {/* Content */}
            <div className="p-6 flex flex-col items-center gap-5">
              <div className="drop-shadow-md">
                <StyledFolder
                  color={palette.main}
                  lightColor={palette.light}
                  className="w-24 h-20"
                />
              </div>
              
              <h3 className="text-xl font-semibold text-text text-center">
                {folder.name}
              </h3>

              {/* Stats */}
              <div className="flex items-center gap-8">
                <div className="flex flex-col items-center">
                  <div className="flex items-center gap-1.5 text-text">
                    <FileText className="w-5 h-5 text-text-soft" />
                    <span className="text-lg font-semibold">{docCount}</span>
                  </div>
                  <span className="text-xs text-text-soft mt-0.5">
                    {docCount === 1 ? 'Document' : 'Documents'}
                  </span>
                </div>
                
                <div className="w-px h-10 bg-border" />
                
                <div className="flex flex-col items-center">
                  <div className="flex items-center gap-1.5 text-text">
                    <Folder className="w-5 h-5 text-text-soft" />
                    <span className="text-lg font-semibold">{folderCount}</span>
                  </div>
                  <span className="text-xs text-text-soft mt-0.5">
                    {folderCount === 1 ? t('subfolder') : t('subfolders')}
                  </span>
                </div>
              </div>

              {/* Created date */}
              <div className="flex items-center gap-1.5 text-xs text-text-soft bg-surface-alt px-3 py-1.5 rounded-full">
                <Calendar className="w-3.5 h-3.5" />
                <span>
                  {t('created', { date: new Date(folder.created_at).toLocaleDateString() })}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="p-4 border-t border-border space-y-3">
              <button
                onClick={() => {
                  setShowInfo(false);
                  onOpen();
                }}
                className="w-full py-3 bg-accent text-white font-semibold rounded-xl hover:bg-accent/90 transition-colors shadow-sm"
              >
                {t('openFolder')}
              </button>
              
              <div className="flex gap-3">
                {onRename && (
                  <button
                    onClick={() => {
                      setShowInfo(false);
                      onRename();
                    }}
                    className="flex-1 py-2.5 bg-surface-alt text-text font-medium rounded-xl hover:bg-surface-alt/80 transition-colors flex items-center justify-center gap-2"
                  >
                    <Pencil className="w-4 h-4" />
                    {tCommon('rename')}
                  </button>
                )}
                
                {onDelete && (
                  <button
                    onClick={() => {
                      setShowInfo(false);
                      onDelete();
                    }}
                    className="flex-1 py-2.5 bg-error/10 text-error font-medium rounded-xl hover:bg-error/20 transition-colors flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    {tCommon('delete')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default FolderIcon;
