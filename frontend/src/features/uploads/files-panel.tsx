'use client';

import {
  FileImage,
  FileSpreadsheet,
  FileText,
  File as FileIcon,
  MoreHorizontal,
  Pencil,
  Trash2,
  Upload as UploadIcon,
} from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useTranslations } from 'next-intl';
import { useRef, useState, type DragEvent } from 'react';
import { toast } from 'sonner';
import type { StorageUsage, Upload } from '@/api/generated/types.gen';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { formatDay, utcIsoToBrussels } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { ActionError } from '@/server/action-client';
import { deleteUpload, renameUpload } from '@/server/uploads/actions';
import { ACCEPT, extensionOf, formatBytes } from './schemas';
import { useFileUpload } from './use-file-upload';

/**
 * Files of an event or one task: a drop zone (for whoever may add files), uploads in progress,
 * and the list. The backend decides what is shown and allowed; `canAdd` and each file's
 * `canChange` only decide which controls show.
 */
export function FilesPanel({
  eventId,
  taskId,
  uploads,
  canAdd,
  enabled,
  readOnly,
  storage,
  showTask = false,
  onChanged,
}: {
  eventId: string;
  /** Upload to this task instead of the event. */
  taskId?: string;
  uploads: Upload[];
  canAdd: boolean;
  /** False when file storage is off: listed files can't be opened or added. */
  enabled: boolean;
  readOnly: boolean;
  /** The organization's usage, shown under the drop zone. */
  storage?: StorageUsage;
  /** Mark task files with their task (the event's combined list). */
  showTask?: boolean;
  onChanged: () => void;
}) {
  const t = useTranslations();
  const { upload, inProgress } = useFileUpload({ eventId, taskId, onUploaded: onChanged });
  const mayAdd = canAdd && enabled && !readOnly;

  return (
    <div className="flex flex-col gap-3">
      {!enabled && <p className="text-sm text-muted-foreground">{t('files.disabled')}</p>}
      {mayAdd && (
        <DropZone onFiles={(files) => void upload(files)} compact={taskId !== undefined} />
      )}
      {storage && mayAdd && (
        <p className="text-xs text-muted-foreground">
          {t('files.storageUsed', {
            used: formatBytes(storage.usedBytes),
            limit: formatBytes(storage.limitBytes),
          })}
        </p>
      )}

      {inProgress.length > 0 && (
        <ul className="flex flex-col gap-2" aria-live="polite">
          {inProgress.map((item) => (
            <li key={item.key} className="flex flex-col gap-1 rounded-2xl bg-card p-3 text-sm">
              <span className="truncate font-semibold">{item.name}</span>
              <progress
                className="sr-only"
                aria-label={t('files.uploading', { name: item.name })}
                max={100}
                value={Math.round(item.progress * 100)}
              />
              <span aria-hidden className="h-1.5 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${Math.round(item.progress * 100)}%` }}
                />
              </span>
            </li>
          ))}
        </ul>
      )}

      {uploads.length === 0 && inProgress.length === 0 ? (
        // With a drop zone above, "no files yet" says nothing new.
        !mayAdd && <p className="text-sm text-muted-foreground">{t('files.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {uploads.map((file) => (
            <FileRow
              key={file.id}
              eventId={eventId}
              file={file}
              showTask={showTask}
              openable={enabled}
              changeable={file.canChange && !readOnly}
              onChanged={onChanged}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function DropZone({ onFiles, compact }: { onFiles: (files: File[]) => void; compact: boolean }) {
  const t = useTranslations();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    onFiles([...event.dataTransfer.files]);
  };

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-border text-center transition-colors',
        compact ? 'p-4' : 'p-8',
        over && 'border-primary bg-brand-tint',
      )}
    >
      <UploadIcon className="size-6 text-muted-foreground" aria-hidden />
      <p className="text-sm font-semibold">{t('files.dropHere')}</p>
      <Button type="button" variant="secondary" size="sm" onClick={() => input.current?.click()}>
        {t('files.choose')}
      </Button>
      <p className="text-xs text-muted-foreground">{t('files.limits')}</p>
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          onFiles([...(event.target.files ?? [])]);
          event.target.value = '';
        }}
      />
    </div>
  );
}

function FileTypeIcon({ mimeType }: { mimeType: string }) {
  const className = 'size-5 shrink-0 text-muted-foreground';
  if (mimeType.startsWith('image/')) return <FileImage className={className} aria-hidden />;
  if (mimeType.includes('sheet') || mimeType.includes('excel') || mimeType === 'text/csv') {
    return <FileSpreadsheet className={className} aria-hidden />;
  }
  if (mimeType === 'application/pdf' || mimeType.includes('word') || mimeType.includes('text')) {
    return <FileText className={className} aria-hidden />;
  }
  return <FileIcon className={className} aria-hidden />;
}

function FileRow({
  eventId,
  file,
  showTask,
  openable,
  changeable,
  onChanged,
}: {
  eventId: string;
  file: Upload;
  showTask: boolean;
  openable: boolean;
  changeable: boolean;
  onChanged: () => void;
}) {
  const t = useTranslations();
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const href = `/api/events/${eventId}/uploads/${file.id}`;

  return (
    <li className="flex items-center gap-3 rounded-2xl bg-card px-3 py-2.5">
      <FileTypeIcon mimeType={file.mimeType} />
      <div className="flex min-w-0 flex-1 flex-col">
        {openable ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-sm font-bold underline-offset-4 hover:underline"
          >
            {file.name}
          </a>
        ) : (
          <span className="truncate text-sm font-bold">{file.name}</span>
        )}
        <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
          <span>{formatBytes(file.sizeBytes)}</span>
          <span aria-hidden>·</span>
          <span>{file.uploadedBy.name}</span>
          <span aria-hidden>·</span>
          <span>{formatDay(utcIsoToBrussels(file.createdAt).date)}</span>
          {showTask && file.task && (
            <Badge variant="brand" className="ml-1 max-w-48 truncate">
              {file.task.title}
            </Badge>
          )}
        </span>
      </div>
      {changeable && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('files.actions', { name: file.name })}
            >
              <MoreHorizontal aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setRenaming(true)}>
              <Pencil aria-hidden />
              {t('files.rename')}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
              <Trash2 aria-hidden />
              {t('files.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <RenameDialog
        eventId={eventId}
        file={file}
        open={renaming}
        onOpenChange={setRenaming}
        onChanged={onChanged}
      />
      <DeleteDialog
        eventId={eventId}
        file={file}
        open={deleting}
        onOpenChange={setDeleting}
        onChanged={onChanged}
      />
    </li>
  );
}

const useErrorToast = () => {
  const t = useTranslations();
  return ({ error }: { error: { serverError?: ActionError } }) =>
    toast.error(t(error.serverError?.message ?? 'common.genericError'));
};

/** Renames the file; the extension stays, so only the part before it is edited. */
function RenameDialog({
  eventId,
  file,
  open,
  onOpenChange,
  onChanged,
}: {
  eventId: string;
  file: Upload;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const t = useTranslations();
  const extension = extensionOf(file.name);
  const base = extension ? file.name.slice(0, -(extension.length + 1)) : file.name;
  const [value, setValue] = useState(base);
  const rename = useAction(renameUpload.bind(null, eventId, file.id), {
    onError: useErrorToast(),
    onSuccess: () => {
      onOpenChange(false);
      onChanged();
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setValue(base);
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('files.renameTitle')}</DialogTitle>
          <DialogDescription>{t('files.renameDescription')}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (value.trim()) rename.execute({ name: `${value.trim()}.${extension}` });
          }}
        >
          <div className="flex items-center gap-2">
            <Input
              aria-label={t('files.name')}
              value={value}
              maxLength={190}
              onChange={(event) => setValue(event.target.value)}
            />
            <span className="shrink-0 text-sm font-semibold text-muted-foreground">
              .{extension}
            </span>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!value.trim() || rename.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({
  eventId,
  file,
  open,
  onOpenChange,
  onChanged,
}: {
  eventId: string;
  file: Upload;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const t = useTranslations();
  const remove = useAction(deleteUpload.bind(null, eventId, file.id), {
    onError: useErrorToast(),
    onSuccess: () => {
      onOpenChange(false);
      onChanged();
    },
  });
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('files.deleteTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('files.deleteWarning', { name: file.name })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={remove.isPending}
            onClick={(event) => {
              event.preventDefault();
              remove.execute();
            }}
          >
            {t('files.deleteConfirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
