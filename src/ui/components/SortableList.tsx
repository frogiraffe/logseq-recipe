import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { type ReactNode, useRef, useState } from "react";
import type { UiMessages } from "../i18n";

export interface EditableItem {
  id: string;
  text: string;
}

function fill(template: string, text: string, position = 0): string {
  return template
    .replace("{item}", () => text)
    .replace("{position}", () => String(position));
}

// One sortable row: only the handle starts a drag, so typing and clicking
// inside the row's inputs never does. The handle also carries keyboard
// sorting (Space, arrows, Escape), which is why the list needs no separate
// move-up/down buttons.
function SortableRow({
  id,
  handleLabel,
  children,
}: {
  id: string;
  handleLabel: string;
  children: ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      className={
        isDragging
          ? "draft-recipe-editor-item draft-recipe-editor-item-dragging"
          : "draft-recipe-editor-item"
      }
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        className="draft-recipe-drag-handle"
        aria-label={handleLabel}
        {...attributes}
        {...listeners}
      >
        <span aria-hidden="true">⠿</span>
      </button>
      {children}
    </li>
  );
}

/**
 * An editable, reorderable list of text items (ingredients, steps, notes,
 * step notes). New items get "new:N" temp ids, unique within this list.
 */
export function SortableList({
  title,
  items,
  addLabel,
  messages,
  onChange,
  renderItemExtra,
  renderItemBelow,
  renderAddExtra,
  nested = false,
}: {
  title: string;
  items: EditableItem[];
  addLabel: string;
  messages: UiMessages;
  onChange(items: EditableItem[]): void;
  renderItemExtra?(item: EditableItem): ReactNode;
  // Full-width content on its own line under the row (step notes).
  renderItemBelow?(item: EditableItem): ReactNode;
  // Extra controls beside the add row; receives an adder for new items.
  renderAddExtra?(add: (text: string) => void): ReactNode;
  // A list inside another list's item (step notes).
  nested?: boolean;
}) {
  const counter = useRef(0);
  const [draft, setDraft] = useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const textOf = (id: string | number) =>
    items.find((item) => item.id === id)?.text ?? String(id);
  const positionOf = (id: string | number) =>
    items.findIndex((item) => item.id === id) + 1;

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = items.findIndex((item) => item.id === active.id);
    const to = items.findIndex((item) => item.id === over.id);
    if (from < 0 || to < 0) return;
    onChange(arrayMove(items, from, to));
  }

  function appendItem(text: string) {
    counter.current += 1;
    onChange([...items, { id: `new:${counter.current}`, text }]);
  }

  function addItem() {
    const text = draft.trim();
    if (!text) return;
    appendItem(text);
    setDraft("");
  }

  return (
    <section
      className={
        nested
          ? "draft-recipe-section draft-recipe-nested-section"
          : "draft-recipe-section"
      }
    >
      {nested ? (
        // The disclosure summary already shows this visually; the heading
        // keeps each nested list named for screen readers.
        <h3 className="draft-recipe-visually-hidden">{title}</h3>
      ) : (
        <h2>{title}</h2>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
        accessibility={{
          screenReaderInstructions: { draggable: messages.dragInstructions },
          announcements: {
            onDragStart: ({ active }) =>
              fill(
                messages.dragPickedUp,
                textOf(active.id),
                positionOf(active.id),
              ),
            onDragOver: ({ active, over }) =>
              over
                ? fill(
                    messages.dragMovedTo,
                    textOf(active.id),
                    positionOf(over.id),
                  )
                : undefined,
            onDragEnd: ({ active, over }) =>
              over
                ? fill(
                    messages.dragDropped,
                    textOf(active.id),
                    positionOf(over.id),
                  )
                : fill(messages.dragCancelled, textOf(active.id)),
            onDragCancel: ({ active }) =>
              fill(messages.dragCancelled, textOf(active.id)),
          },
        }}
      >
        <SortableContext
          items={items.map((item) => item.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="draft-recipe-editor-items">
            {items.map((item, index) => (
              <SortableRow
                key={item.id}
                id={item.id}
                handleLabel={`${messages.dragToReorder}: ${item.text}`}
              >
                {/* A textarea, not an input: an input silently strips the
                    line breaks of a multi-line step or note on first edit. */}
                <textarea
                  aria-label={`${title} ${index + 1}`}
                  rows={item.text.split("\n").length}
                  value={item.text}
                  onChange={(event) =>
                    onChange(
                      items.map((candidate) =>
                        candidate.id === item.id
                          ? { ...candidate, text: event.currentTarget.value }
                          : candidate,
                      ),
                    )
                  }
                />
                {renderItemExtra?.(item)}
                <button
                  type="button"
                  className="draft-recipe-icon-button draft-recipe-remove-button"
                  aria-label={`${messages.remove}: ${item.text}`}
                  title={messages.remove}
                  onClick={() =>
                    onChange(
                      items.filter((candidate) => candidate.id !== item.id),
                    )
                  }
                >
                  <span aria-hidden="true">×</span>
                </button>
                {renderItemBelow && (
                  <div className="draft-recipe-editor-item-below">
                    {renderItemBelow(item)}
                  </div>
                )}
              </SortableRow>
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <div className="draft-recipe-editor-add-row">
        <input
          aria-label={addLabel}
          placeholder={addLabel}
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addItem();
            }
          }}
        />
        <button type="button" onClick={addItem} disabled={!draft.trim()}>
          {addLabel}
        </button>
        {renderAddExtra?.(appendItem)}
      </div>
    </section>
  );
}
