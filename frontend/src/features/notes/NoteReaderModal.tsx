import { Modal } from "../../components/ui/Modal";
import type { Tag } from "../tags/api";
import { TagChip } from "../tags/TagPicker";
import { MarkdownView } from "./MarkdownView";

interface NoteReaderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  content: string;
  tags: Tag[];
}

/** Full-viewport reading view of a note: the rendered GFM markdown at ~80%
 * of the screen. Read-only by design - editing stays in the side editor, so
 * there is never a second autosave fighting over the same note. */
export function NoteReaderModal({ open, onOpenChange, title, content, tags }: NoteReaderModalProps) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      className="md:h-[85vh] md:max-h-[85vh] md:w-[80vw] md:max-w-[80vw]"
    >
      <div className="space-y-3">
        {tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {tags.map((tag) => (
              <TagChip key={tag.id} name={tag.name} />
            ))}
          </div>
        ) : null}
        {content.trim() ? (
          <div className="markdown-body">
            <MarkdownView>{content}</MarkdownView>
          </div>
        ) : (
          <p className="text-sm text-text-muted">Nothing to preview yet.</p>
        )}
      </div>
    </Modal>
  );
}
