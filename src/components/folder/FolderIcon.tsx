'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Folder, MoreVertical, Pencil, Trash2, FolderOpen, FileText, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FolderWithStats, WorkspaceFolder } from '@/types/database';

// Default folder colors
const defaultColors = [
  '#2d8878', // Teal
  '#6366f1', // Indigo
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#8b5cf6', // Purple
  '#10b981', // Emerald
];

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

  // Get folder color or use default
  const folderColor = folder.color || defaultColors[0];

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
          'hover:bg-surface-alt/50 active:scale-95',
          'w-[100px] focus:outline-none focus:ring-2 focus:ring-accent/50',
          isDragOver && 'bg-accent/10 ring-2 ring-accent scale-105',
          isDragging && 'opacity-50'
        )}
      >
        {/* Folder icon with badge */}
        <div className="relative">
          <Folder
            className="w-14 h-14 transition-transform"
            style={{ color: folderColor }}
            fill={folderColor}
            fillOpacity={0.15}
          />
          
          {/* Item count badge */}
          {totalItems > 0 && (
            <span
              className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 flex items-center justify-center text-[11px] font-bold text-white rounded-full"
              style={{ backgroundColor: folderColor }}
            >
              {totalItems > 99 ? '99+' : totalItems}
            </span>
          )}
        </div>

        {/* Folder name */}
        <span className="text-xs font-medium text-text text-center line-clamp-2 leading-tight">
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
          'absolute top-1 right-1 p-1 rounded-md transition-opacity',
          'opacity-0 group-hover:opacity-100 hover:bg-surface-alt',
          showMenu && 'opacity-100'
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
          <div className="absolute right-0 top-8 w-40 bg-surface border border-border rounded-lg shadow-lg z-50 overflow-hidden animate-fade-in">
            <button
              onClick={() => {
                setShowMenu(false);
                onOpen();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text hover:bg-surface-alt transition-colors"
            >
              <FolderOpen className="w-4 h-4" />
              {t('openFolder')}
            </button>
            
            {onRename && (
              <button
                onClick={() => {
                  setShowMenu(false);
                  onRename();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text hover:bg-surface-alt transition-colors"
              >
                <Pencil className="w-4 h-4" />
                {tCommon('rename')}
              </button>
            )}
            
            {onDelete && (
              <>
                <hr className="border-border" />
                <button
                  onClick={() => {
                    setShowMenu(false);
                    onDelete();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-error hover:bg-error/10 transition-colors"
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
          <div className="fixed inset-x-4 bottom-4 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[380px] bg-surface rounded-2xl shadow-xl z-50 animate-slide-up overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <span className="text-sm font-medium text-text-soft">{t('folder')}</span>
              <button
                onClick={() => setShowInfo(false)}
                className="text-sm font-semibold text-accent"
              >
                {tCommon('done')}
              </button>
            </div>

            {/* Content */}
            <div className="p-6 flex flex-col items-center gap-4">
              <Folder
                className="w-16 h-16"
                style={{ color: folderColor }}
                fill={folderColor}
                fillOpacity={0.15}
              />
              
              <h3 className="text-lg font-semibold text-text text-center">
                {folder.name}
              </h3>

              {/* Stats */}
              <div className="flex items-center gap-6">
                <div className="flex flex-col items-center">
                  <div className="flex items-center gap-1 text-text">
                    <FileText className="w-4 h-4" />
                    <span className="font-semibold">{docCount}</span>
                  </div>
                  <span className="text-xs text-text-soft">
                    {docCount === 1 ? 'Document' : 'Documents'}
                  </span>
                </div>
                
                <div className="flex flex-col items-center">
                  <div className="flex items-center gap-1 text-text">
                    <Folder className="w-4 h-4" />
                    <span className="font-semibold">{folderCount}</span>
                  </div>
                  <span className="text-xs text-text-soft">
                    {folderCount === 1 ? t('subfolder') : t('subfolders')}
                  </span>
                </div>
              </div>

              {/* Created date */}
              <div className="flex items-center gap-1 text-xs text-text-soft">
                <Calendar className="w-3 h-3" />
                <span>
                  {t('created', { date: new Date(folder.created_at).toLocaleDateString() })}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="p-4 border-t border-border space-y-2">
              <button
                onClick={() => {
                  setShowInfo(false);
                  onOpen();
                }}
                className="w-full py-3 bg-accent text-white font-semibold rounded-xl hover:bg-accent/90 transition-colors"
              >
                {t('openFolder')}
              </button>
              
              <div className="flex gap-2">
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
