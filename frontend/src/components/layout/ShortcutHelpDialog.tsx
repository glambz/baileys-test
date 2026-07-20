import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { t } from '@/i18n';

interface ShortcutHelpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ShortcutGroup {
  titleKey?: string;
  items: Array<{ keys: string[]; labelKey: string }>;
}

const SHORTCUTS: ShortcutGroup[] = [
  {
    items: [
      { keys: ['/'], labelKey: 'shortcuts.focusSearch' },
      { keys: ['Esc'], labelKey: 'shortcuts.clearComposer' },
      { keys: ['?'], labelKey: 'shortcuts.showHelp' },
    ],
  },
  {
    titleKey: 'shortcuts.groupMenus',
    items: [
      { keys: ['g', 'c'], labelKey: 'shortcuts.goChats' },
      { keys: ['g', 'a'], labelKey: 'shortcuts.goAiChat' },
      { keys: ['Alt', '1'], labelKey: 'shortcuts.menuChats' },
      { keys: ['Alt', '2'], labelKey: 'shortcuts.menuCrm' },
      { keys: ['Alt', '3'], labelKey: 'shortcuts.menuAi' },
    ],
  },
  {
    titleKey: 'shortcuts.groupCrm',
    items: [
      { keys: ['c'], labelKey: 'shortcuts.crmSearch' },
      { keys: ['n'], labelKey: 'shortcuts.crmNewRecord' },
      { keys: ['u'], labelKey: 'shortcuts.crmUpload' },
    ],
  },
];

/**
 * Modal listing every global keyboard shortcut. Opened via `?` or the
 * theme menu (Plan 08).
 */
export function ShortcutHelpDialog({ open, onOpenChange }: ShortcutHelpDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('shortcuts.title')}</DialogTitle>
          <DialogDescription>{t('shortcuts.intro')}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto">
          {SHORTCUTS.map((group, gi) => (
            <section key={gi}>
              {group.titleKey && (
                <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t(group.titleKey)}
                </h4>
              )}
              <ul className="space-y-1 text-sm">
                {group.items.map((s) => (
                  <li
                    key={s.labelKey}
                    className="flex items-center justify-between gap-4 rounded px-2 py-1 hover:bg-secondary/40"
                  >
                    <span>{t(s.labelKey)}</span>
                    <span className="flex items-center gap-1">
                      {s.keys.map((k, idx) => (
                        <kbd
                          key={`${s.labelKey}-${idx}`}
                          className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px]"
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}