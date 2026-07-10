import { useEffect, useRef, useState } from "react";

export default function ImageUploader({ file, onFileSelect }) {
  const inputRef = useRef(null);
  const [previewUrl, setPreviewUrl] = useState("");

  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      return undefined;
    }

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function handleFiles(nextFile) {
    if (!nextFile) {
      return;
    }
    onFileSelect(nextFile);
  }

  function handleDrop(event) {
    event.preventDefault();
    handleFiles(event.dataTransfer.files?.[0] || null);
  }

  return (
    <section className="panel p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="eyebrow">Photo input</p>
          <h2 className="mt-2 font-sans font-bold tracking-tight text-2xl text-slate-900">Upload a street, skyline, or landscape</h2>
        </div>
      </div>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
        className="group flex min-h-64 w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center transition hover:border-blue-400 hover:bg-blue-50"
      >
        {previewUrl ? (
          <img
            src={previewUrl}
            alt="Selected upload preview"
            className="max-h-56 rounded-xl object-cover shadow-sm ring-1 ring-slate-200"
          />
        ) : (
          <div className="space-y-3">
            <p className="text-lg font-semibold text-slate-700 group-hover:text-blue-700">Drag and drop an image here</p>
            <p className="text-sm text-slate-500">JPG, PNG, or WEBP. Click to browse if you prefer.</p>
          </div>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => handleFiles(event.target.files?.[0] || null)}
      />

      {file ? <div className="mt-4 font-mono text-sm text-slate-600">{file.name}</div> : null}
    </section>
  );
}
