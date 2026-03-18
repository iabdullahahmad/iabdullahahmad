"use client";

import { useEffect } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";

type RichTextEditorProps = {
  placeholder?: string;
  onChange: (html: string) => void;
};

type ToolbarAction = {
  label: string;
  isActive: (editor: Editor) => boolean;
  isDisabled: (editor: Editor) => boolean;
  run: (editor: Editor) => void;
};

const toolbarActions: ToolbarAction[] = [
  {
    label: "H2",
    isActive: (editor) => editor.isActive("heading", { level: 2 }),
    isDisabled: (editor) => !editor.can().chain().focus().toggleHeading({ level: 2 }).run(),
    run: (editor) => {
      editor.chain().focus().toggleHeading({ level: 2 }).run();
    },
  },
  {
    label: "Bold",
    isActive: (editor) => editor.isActive("bold"),
    isDisabled: (editor) => !editor.can().chain().focus().toggleBold().run(),
    run: (editor) => {
      editor.chain().focus().toggleBold().run();
    },
  },
  {
    label: "Italic",
    isActive: (editor) => editor.isActive("italic"),
    isDisabled: (editor) => !editor.can().chain().focus().toggleItalic().run(),
    run: (editor) => {
      editor.chain().focus().toggleItalic().run();
    },
  },
  {
    label: "Strike",
    isActive: (editor) => editor.isActive("strike"),
    isDisabled: (editor) => !editor.can().chain().focus().toggleStrike().run(),
    run: (editor) => {
      editor.chain().focus().toggleStrike().run();
    },
  },
  {
    label: "Bullet",
    isActive: (editor) => editor.isActive("bulletList"),
    isDisabled: (editor) => !editor.can().chain().focus().toggleBulletList().run(),
    run: (editor) => {
      editor.chain().focus().toggleBulletList().run();
    },
  },
  {
    label: "Numbered",
    isActive: (editor) => editor.isActive("orderedList"),
    isDisabled: (editor) => !editor.can().chain().focus().toggleOrderedList().run(),
    run: (editor) => {
      editor.chain().focus().toggleOrderedList().run();
    },
  },
  {
    label: "Quote",
    isActive: (editor) => editor.isActive("blockquote"),
    isDisabled: (editor) => !editor.can().chain().focus().toggleBlockquote().run(),
    run: (editor) => {
      editor.chain().focus().toggleBlockquote().run();
    },
  },
  {
    label: "Clear",
    isActive: () => false,
    isDisabled: () => false,
    run: (editor) => {
      editor.chain().focus().clearNodes().unsetAllMarks().run();
    },
  },
];

export function RichTextEditor({ placeholder = "Write your post...", onChange }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: "<p></p>",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "rich-editor-surface min-h-56 rounded-b-2xl border border-slate-300 bg-white/90 px-4 py-3 text-sm leading-6 text-slate-800 outline-none",
      },
    },
    onUpdate: ({ editor: activeEditor }) => {
      onChange(activeEditor.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    onChange(editor.getHTML());
  }, [editor, onChange]);

  if (!editor) {
    return (
      <div className="rounded-2xl border border-slate-300 bg-white/90 p-4 text-sm text-slate-500">
        Loading editor...
      </div>
    );
  }

  return (
    <div className="rounded-2xl shadow-sm">
      <div className="flex flex-wrap gap-2 rounded-t-2xl border border-b-0 border-slate-300 bg-white/90 p-3">
        {toolbarActions.map((action) => {
          const active = action.isActive(editor);
          const disabled = action.isDisabled(editor);

          return (
            <button
              key={action.label}
              type="button"
              onClick={() => action.run(editor)}
              disabled={disabled}
              className={`rounded-lg border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] transition ${
                active
                  ? "border-cyan-500 bg-cyan-500 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:border-cyan-400 hover:text-cyan-800"
              } disabled:cursor-not-allowed disabled:opacity-45`}
            >
              {action.label}
            </button>
          );
        })}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}