import { useState, useCallback, useRef } from 'react'
import { jsPDF } from 'jspdf'
import './App.css'

let idCounter = 0
function uid() { return ++idCounter }

export default function App() {
  const [files, setFiles] = useState([])
  const [dragging, setDragging] = useState(false)
  const [pdfTitle, setPdfTitle] = useState('My Document')
  const [pageSize, setPageSize] = useState('a4')
  const [orientation, setOrientation] = useState('portrait')
  const [fitMode, setFitMode] = useState('fit')
  const [margin, setMargin] = useState(20)
  const [generating, setGenerating] = useState(false)
  const fileInputRef = useRef()

  const addFiles = useCallback((incoming) => {
    const imageFiles = [...incoming].filter(f => f.type.startsWith('image/'))
    const entries = imageFiles.map(f => ({
      id: uid(),
      file: f,
      name: f.name,
      preview: URL.createObjectURL(f),
    }))
    setFiles(prev => [...prev, ...entries])
  }, [])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }, [addFiles])

  const removeFile = (id) => {
    setFiles(prev => {
      const f = prev.find(f => f.id === id)
      if (f) URL.revokeObjectURL(f.preview)
      return prev.filter(f => f.id !== id)
    })
  }

  const moveFile = (id, dir) => {
    setFiles(prev => {
      const idx = prev.findIndex(f => f.id === id)
      if ((dir === -1 && idx === 0) || (dir === 1 && idx === prev.length - 1)) return prev
      const next = [...prev]
      ;[next[idx], next[idx + dir]] = [next[idx + dir], next[idx]]
      return next
    })
  }

  const generatePDF = async () => {
    if (!files.length) return
    setGenerating(true)

    const doc = new jsPDF({
      orientation,
      unit: 'pt',
      format: pageSize,
    })

    const pageW = doc.internal.pageSize.getWidth()
    const pageH = doc.internal.pageSize.getHeight()
    const mg = Number(margin)

    for (let i = 0; i < files.length; i++) {
      if (i > 0) doc.addPage([pageW, pageH], orientation === 'landscape' ? 'l' : 'p')

      const file = files[i]
      const imgData = await fileToDataURL(file.file)
      const dims = await getImageDimensions(imgData)

      let drawX = mg, drawY = mg
      let drawW, drawH

      const availW = pageW - mg * 2
      const availH = pageH - mg * 2

      if (fitMode === 'fit') {
        const scale = Math.min(availW / dims.w, availH / dims.h)
        drawW = dims.w * scale
        drawH = dims.h * scale
        drawX = mg + (availW - drawW) / 2
        drawY = mg + (availH - drawH) / 2
      } else if (fitMode === 'fill') {
        const scale = Math.max(availW / dims.w, availH / dims.h)
        drawW = dims.w * scale
        drawH = dims.h * scale
        drawX = mg + (availW - drawW) / 2
        drawY = mg + (availH - drawH) / 2
      } else {
        // stretch
        drawW = availW
        drawH = availH
      }

      const fmt = getImgFormat(file.file.type)
      doc.addImage(imgData, fmt, drawX, drawY, drawW, drawH)
    }

    const filename = (pdfTitle || 'document').replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.pdf'
    doc.save(filename)
    setGenerating(false)
  }

  const fileToDataURL = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

  const getImageDimensions = (dataUrl) => new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.src = dataUrl
  })

  const getImgFormat = (mimeType) => {
    if (mimeType === 'image/png') return 'PNG'
    if (mimeType === 'image/webp') return 'WEBP'
    return 'JPEG'
  }

  const hasFiles = files.length > 0

  return (
    <div className="app">
      <header className="header">
        <div className="logo">
          <span className="logo-mark">▣</span>
          <span className="logo-text">ImgToPDF by Ajeel</span>
        </div>
        <p className="tagline">Batch images → PDF · 100% browser-based · no upload</p>
      </header>

      <main className="main">
        <div
          className={`drop-zone ${dragging ? 'dragover' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input ref={fileInputRef} type="file" multiple accept="image/*" style={{ display: 'none' }} onChange={e => addFiles(e.target.files)} />
          <div className="drop-glyph">{dragging ? '↓' : '+'}</div>
          <div className="drop-main">Drop images here or click to browse</div>
          <div className="drop-sub">PNG · JPG · WEBP · GIF · BMP — each image becomes one PDF page</div>
        </div>

        {hasFiles && (
          <>
            <section className="queue-section">
              <div className="queue-header">
                <span className="queue-count">{files.length} image{files.length !== 1 ? 's' : ''} · drag to reorder</span>
                <button className="clear-btn" onClick={() => setFiles([])} disabled={generating}>Clear all</button>
              </div>
              <div className="queue-list">
                {files.map((f, idx) => (
                  <div key={f.id} className="file-row">
                    <span className="file-num">{String(idx + 1).padStart(2, '0')}</span>
                    <img src={f.preview} alt={f.name} className="file-thumb" />
                    <span className="file-name" title={f.name}>{f.name}</span>
                    <div className="file-actions">
                      <button className="order-btn" onClick={() => moveFile(f.id, -1)} disabled={idx === 0 || generating} title="Move up">↑</button>
                      <button className="order-btn" onClick={() => moveFile(f.id, 1)} disabled={idx === files.length - 1 || generating} title="Move down">↓</button>
                      <button className="rm-btn" onClick={() => removeFile(f.id)} disabled={generating} title="Remove">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="controls-section">
              <div className="controls-grid">
                <div className="ctrl-group span-2">
                  <label>PDF filename</label>
                  <input type="text" value={pdfTitle} onChange={e => setPdfTitle(e.target.value)} placeholder="my_document" />
                </div>
                <div className="ctrl-group">
                  <label>Page size</label>
                  <select value={pageSize} onChange={e => setPageSize(e.target.value)}>
                    <option value="a4">A4</option>
                    <option value="letter">Letter</option>
                    <option value="a3">A3</option>
                    <option value="legal">Legal</option>
                  </select>
                </div>
                <div className="ctrl-group">
                  <label>Orientation</label>
                  <select value={orientation} onChange={e => setOrientation(e.target.value)}>
                    <option value="portrait">Portrait</option>
                    <option value="landscape">Landscape</option>
                  </select>
                </div>
                <div className="ctrl-group">
                  <label>Image fit</label>
                  <select value={fitMode} onChange={e => setFitMode(e.target.value)}>
                    <option value="fit">Fit (preserve aspect ratio)</option>
                    <option value="fill">Fill page</option>
                    <option value="stretch">Stretch to page</option>
                  </select>
                </div>
                <div className="ctrl-group">
                  <label>Margin (pt)</label>
                  <select value={margin} onChange={e => setMargin(e.target.value)}>
                    <option value={0}>None — 0pt</option>
                    <option value={10}>Small — 10pt</option>
                    <option value={20}>Normal — 20pt</option>
                    <option value={40}>Wide — 40pt</option>
                  </select>
                </div>
              </div>

              <button className="btn-generate" onClick={generatePDF} disabled={generating || !hasFiles}>
                {generating ? 'Generating…' : `↓ Download PDF (${files.length} page${files.length !== 1 ? 's' : ''})`}
              </button>
            </section>
          </>
        )}
      </main>
    </div>
  )
}
