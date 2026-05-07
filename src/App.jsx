import { useState, useCallback, useEffect, useRef } from 'react'
import { jsPDF } from 'jspdf'
import { createWorker } from 'tesseract.js'
import './App.css'

let idCounter = 0
function uid() { return ++idCounter }

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID

export default function App() {
  const [files, setFiles] = useState([])
  const [dragging, setDragging] = useState(false)
  const [pdfTitle, setPdfTitle] = useState(defaultDocumentName())
  const [titleTouched, setTitleTouched] = useState(false)
  const [pageSize, setPageSize] = useState('a4')
  const [orientation, setOrientation] = useState('portrait')
  const [fitMode, setFitMode] = useState('fit')
  const [margin, setMargin] = useState(20)
  const [cleanupMode, setCleanupMode] = useState('enhance')
  const [ocrMode, setOcrMode] = useState('off')
  const [driveFolder, setDriveFolder] = useState('')
  const [generating, setGenerating] = useState(false)
  const [status, setStatus] = useState('')
  const [driveLink, setDriveLink] = useState('')
  const [ocrText, setOcrText] = useState('')
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraStream, setCameraStream] = useState(null)
  const [cameraError, setCameraError] = useState('')
  const fileInputRef = useRef()
  const videoRef = useRef()
  const canvasRef = useRef()

  const addFiles = useCallback((incoming) => {
    const imageFiles = [...incoming].filter(file => file.type.startsWith('image/'))
    if (!imageFiles.length) return

    const entries = imageFiles.map(file => ({
      id: uid(),
      file,
      name: file.name,
      preview: URL.createObjectURL(file),
    }))

    setFiles(prev => [...prev, ...entries])
    if (!titleTouched) {
      setPdfTitle(makeTitleFromFile(imageFiles[0].name))
    }
  }, [titleTouched])

  const onDrop = useCallback((event) => {
    event.preventDefault()
    setDragging(false)
    addFiles(event.dataTransfer.files)
  }, [addFiles])

  useEffect(() => {
    if (videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream
    }
  }, [cameraStream])

  useEffect(() => () => {
    if (cameraStream) stopMediaStream(cameraStream)
  }, [cameraStream])

  const startCamera = async () => {
    setCameraError('')

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera capture is not available in this browser.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })
      setCameraStream(stream)
      setCameraOpen(true)
    } catch {
      setCameraError('Camera permission was blocked or no camera was found.')
    }
  }

  const stopCamera = () => {
    if (cameraStream) stopMediaStream(cameraStream)
    setCameraStream(null)
    setCameraOpen(false)
  }

  const capturePhoto = async () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !video.videoWidth) return

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92))
    if (!blob) return

    const file = new File([blob], `camera_scan_${Date.now()}.jpg`, { type: 'image/jpeg' })
    addFiles([file])
    setStatus('Captured page added to the PDF queue.')
  }

  const clearFiles = () => {
    files.forEach(file => URL.revokeObjectURL(file.preview))
    setFiles([])
    setOcrText('')
    setDriveLink('')
    setStatus('')
  }

  const removeFile = (id) => {
    setFiles(prev => {
      const file = prev.find(item => item.id === id)
      if (file) URL.revokeObjectURL(file.preview)
      return prev.filter(item => item.id !== id)
    })
  }

  const moveFile = (id, dir) => {
    setFiles(prev => {
      const idx = prev.findIndex(file => file.id === id)
      if ((dir === -1 && idx === 0) || (dir === 1 && idx === prev.length - 1)) return prev
      const next = [...prev]
      ;[next[idx], next[idx + dir]] = [next[idx + dir], next[idx]]
      return next
    })
  }

  const generatePDF = async () => {
    if (!files.length) return
    setGenerating(true)
    setDriveLink('')
    setStatus('Preparing PDF...')

    try {
      const { doc, filename, text } = await buildPDF({
        files,
        pageSize,
        orientation,
        fitMode,
        margin,
        cleanupMode,
        ocrMode,
        pdfTitle,
        setStatus,
      })
      doc.save(filename)
      setOcrText(text)
      setStatus(text ? 'PDF downloaded with OCR text included.' : 'PDF downloaded.')
    } catch (err) {
      setStatus(`Could not generate PDF: ${err.message}`)
    } finally {
      setGenerating(false)
    }
  }

  const uploadToDrive = async () => {
    if (!files.length) return
    if (!GOOGLE_CLIENT_ID) {
      setStatus('Add VITE_GOOGLE_CLIENT_ID to enable direct Google Drive upload.')
      return
    }

    setGenerating(true)
    setDriveLink('')
    setStatus('Preparing PDF for Google Drive...')

    try {
      const { doc, filename, text } = await buildPDF({
        files,
        pageSize,
        orientation,
        fitMode,
        margin,
        cleanupMode,
        ocrMode,
        pdfTitle,
        setStatus,
      })
      setOcrText(text)
      setStatus('Connecting to Google Drive...')
      const link = await uploadBlobToDrive(doc.output('blob'), filename, driveFolder)
      setDriveLink(link)
      setStatus('Uploaded to Google Drive.')
    } catch (err) {
      setStatus(`Drive upload failed: ${err.message}`)
    } finally {
      setGenerating(false)
    }
  }

  const hasFiles = files.length > 0

  return (
    <div className="app">
      <header className="header">
        <div className="logo">
          <span className="logo-mark">[]</span>
          <span className="logo-text">ImgToPDF by Ajeel</span>
        </div>
        <p className="tagline">Scan cleanup to PDF to Drive, fully browser-based</p>
      </header>

      <main className="main">
        <section className="capture-section">
          <div
            className={`drop-zone ${dragging ? 'dragover' : ''}`}
            onDragOver={event => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              className="file-input"
              onChange={event => addFiles(event.target.files)}
            />
            <div className="drop-glyph">{dragging ? 'v' : '+'}</div>
            <div className="drop-main">Drop scanned images here or click to browse</div>
            <div className="drop-sub">PNG, JPG, WEBP, GIF, BMP - each image becomes one PDF page</div>
          </div>

          <div className="camera-panel">
            {!cameraOpen ? (
              <>
                <div>
                  <h2 className="panel-title">Camera scan</h2>
                  <p className="panel-copy">Take document photos here and add each page to the queue.</p>
                </div>
                <button className="btn-camera" onClick={startCamera}>Open camera</button>
                {cameraError && <p className="camera-error">{cameraError}</p>}
              </>
            ) : (
              <>
                <video ref={videoRef} className="camera-preview" autoPlay playsInline muted />
                <canvas ref={canvasRef} className="capture-canvas" />
                <div className="camera-actions">
                  <button className="btn-camera primary" onClick={capturePhoto}>Capture page</button>
                  <button className="btn-camera" onClick={stopCamera}>Close camera</button>
                </div>
              </>
            )}
          </div>
        </section>

        {hasFiles && (
          <>
            <section className="queue-section">
              <div className="queue-header">
                <span className="queue-count">{files.length} image{files.length !== 1 ? 's' : ''}</span>
                <button className="clear-btn" onClick={clearFiles} disabled={generating}>Clear all</button>
              </div>
              <div className="queue-list">
                {files.map((file, idx) => (
                  <div key={file.id} className="file-row">
                    <span className="file-num">{String(idx + 1).padStart(2, '0')}</span>
                    <img src={file.preview} alt={file.name} className="file-thumb" />
                    <span className="file-name" title={file.name}>{file.name}</span>
                    <div className="file-actions">
                      <button className="order-btn" onClick={() => moveFile(file.id, -1)} disabled={idx === 0 || generating} title="Move up">Up</button>
                      <button className="order-btn" onClick={() => moveFile(file.id, 1)} disabled={idx === files.length - 1 || generating} title="Move down">Dn</button>
                      <button className="rm-btn" onClick={() => removeFile(file.id)} disabled={generating} title="Remove">X</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="controls-section">
              <div className="controls-grid">
                <div className="ctrl-group span-2">
                  <label>PDF filename</label>
                  <input
                    type="text"
                    value={pdfTitle}
                    onChange={event => {
                      setTitleTouched(true)
                      setPdfTitle(event.target.value)
                    }}
                    placeholder="my_document"
                  />
                </div>
                <div className="ctrl-group">
                  <label>Page size</label>
                  <select value={pageSize} onChange={event => setPageSize(event.target.value)}>
                    <option value="a4">A4</option>
                    <option value="letter">Letter</option>
                    <option value="a3">A3</option>
                    <option value="legal">Legal</option>
                  </select>
                </div>
                <div className="ctrl-group">
                  <label>Orientation</label>
                  <select value={orientation} onChange={event => setOrientation(event.target.value)}>
                    <option value="portrait">Portrait</option>
                    <option value="landscape">Landscape</option>
                  </select>
                </div>
                <div className="ctrl-group">
                  <label>Image fit</label>
                  <select value={fitMode} onChange={event => setFitMode(event.target.value)}>
                    <option value="fit">Fit</option>
                    <option value="fill">Fill page</option>
                    <option value="stretch">Stretch to page</option>
                  </select>
                </div>
                <div className="ctrl-group">
                  <label>Margin</label>
                  <select value={margin} onChange={event => setMargin(event.target.value)}>
                    <option value={0}>None - 0pt</option>
                    <option value={10}>Small - 10pt</option>
                    <option value={20}>Normal - 20pt</option>
                    <option value={40}>Wide - 40pt</option>
                  </select>
                </div>
                <div className="ctrl-group">
                  <label>Scan cleanup</label>
                  <select value={cleanupMode} onChange={event => setCleanupMode(event.target.value)}>
                    <option value="enhance">Enhance contrast</option>
                    <option value="mono">Black and white</option>
                    <option value="grayscale">Grayscale</option>
                    <option value="original">Original image</option>
                  </select>
                </div>
                <div className="ctrl-group">
                  <label>OCR</label>
                  <select value={ocrMode} onChange={event => setOcrMode(event.target.value)}>
                    <option value="off">Off</option>
                    <option value="extract">Extract text only</option>
                    <option value="appendix">Add searchable text pages</option>
                  </select>
                </div>
                <div className="ctrl-group span-2">
                  <label>Drive folder link or ID</label>
                  <input
                    type="text"
                    value={driveFolder}
                    onChange={event => setDriveFolder(event.target.value)}
                    placeholder="Optional: https://drive.google.com/drive/folders/..."
                  />
                </div>
              </div>

              <div className="action-row">
                <button className="btn-generate" onClick={generatePDF} disabled={generating || !hasFiles}>
                  {generating ? 'Working...' : `Download PDF (${files.length} page${files.length !== 1 ? 's' : ''})`}
                </button>
                <button className="btn-drive" onClick={uploadToDrive} disabled={generating || !hasFiles}>
                  Upload to Drive
                </button>
              </div>

              {status && <p className="status">{status}</p>}
              {driveLink && (
                <a className="drive-link" href={driveLink} target="_blank" rel="noreferrer">Open uploaded file</a>
              )}
              {ocrText && (
                <textarea className="ocr-output" value={ocrText} readOnly aria-label="Extracted OCR text" />
              )}
            </section>
          </>
        )}
      </main>
    </div>
  )
}

async function buildPDF(options) {
  const {
    files,
    pageSize,
    orientation,
    fitMode,
    margin,
    cleanupMode,
    ocrMode,
    pdfTitle,
    setStatus,
  } = options

  const doc = new jsPDF({ orientation, unit: 'pt', format: pageSize })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const mg = Number(margin)
  const recognizedPages = []
  let worker = null

  if (ocrMode !== 'off') {
    setStatus('Starting OCR...')
    worker = await createWorker('eng')
  }

  try {
    for (let i = 0; i < files.length; i++) {
      if (i > 0) doc.addPage([pageW, pageH], orientation === 'landscape' ? 'l' : 'p')

      const file = files[i]
      setStatus(`Processing page ${i + 1} of ${files.length}...`)
      const imgData = await prepareImage(file.file, cleanupMode)
      const dims = await getImageDimensions(imgData)

      const availW = pageW - mg * 2
      const availH = pageH - mg * 2
      let drawX = mg
      let drawY = mg
      let drawW = availW
      let drawH = availH

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
      }

      doc.addImage(imgData, 'JPEG', drawX, drawY, drawW, drawH)

      if (worker) {
        setStatus(`Reading text on page ${i + 1} of ${files.length}...`)
        const result = await worker.recognize(imgData)
        const text = result.data.text.trim()
        if (text) recognizedPages.push({ page: i + 1, text })
      }
    }
  } finally {
    if (worker) await worker.terminate()
  }

  const text = recognizedPages
    .map(page => `Page ${page.page}\n${page.text}`)
    .join('\n\n')

  if (ocrMode === 'appendix' && text) {
    addOcrAppendix(doc, text)
  }

  return {
    doc,
    filename: `${slugify(pdfTitle || 'document')}.pdf`,
    text,
  }
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = event => resolve(event.target.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function getImageDimensions(dataUrl) {
  return loadImage(dataUrl).then(img => ({ w: img.naturalWidth, h: img.naturalHeight }))
}

async function prepareImage(file, cleanupMode) {
  const dataUrl = await fileToDataURL(file)
  if (cleanupMode === 'original') return dataUrl

  const img = await loadImage(dataUrl)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0)

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data

  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
    let value = gray

    if (cleanupMode === 'enhance') {
      value = Math.max(0, Math.min(255, (gray - 128) * 1.35 + 138))
    }

    if (cleanupMode === 'mono') {
      value = gray > 168 ? 255 : 0
    }

    data[i] = value
    data[i + 1] = value
    data[i + 2] = value
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas.toDataURL('image/jpeg', 0.92)
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function addOcrAppendix(doc, text) {
  const width = doc.internal.pageSize.getWidth()
  const height = doc.internal.pageSize.getHeight()
  const margin = 40
  const lineHeight = 12
  const maxLines = Math.floor((height - margin * 2) / lineHeight)
  const lines = doc.splitTextToSize(text, width - margin * 2)

  doc.addPage()
  doc.setFontSize(10)
  doc.text('OCR Text', margin, margin)

  for (let i = 0; i < lines.length; i += maxLines) {
    if (i > 0) doc.addPage()
    doc.text(lines.slice(i, i + maxLines), margin, margin + 22)
  }
}

function defaultDocumentName() {
  return `scan_${new Date().toISOString().slice(0, 10)}`
}

function makeTitleFromFile(filename) {
  const base = filename.replace(/\.[^.]+$/, '')
  return `${base}_${new Date().toISOString().slice(0, 10)}`
}

function slugify(value) {
  return value.trim().replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'document'
}

function stopMediaStream(stream) {
  stream.getTracks().forEach(track => track.stop())
}

function loadGoogleIdentityScript() {
  if (window.google?.accounts?.oauth2) return Promise.resolve()

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-google-identity]')
    if (existing) {
      existing.addEventListener('load', resolve, { once: true })
      existing.addEventListener('error', reject, { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.dataset.googleIdentity = 'true'
    script.onload = resolve
    script.onerror = () => reject(new Error('Could not load Google sign-in script.'))
    document.head.appendChild(script)
  })
}

async function getGoogleAccessToken() {
  await loadGoogleIdentityScript()

  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: response => {
        if (response.error) {
          reject(new Error(response.error))
          return
        }
        resolve(response.access_token)
      },
    })

    client.requestAccessToken({ prompt: 'consent' })
  })
}

async function uploadBlobToDrive(blob, filename, folderInput) {
  const token = await getGoogleAccessToken()
  const boundary = 'imgtopdf_boundary'
  const folderId = extractDriveFolderId(folderInput)
  const metadata = {
    name: filename,
    mimeType: 'application/pdf',
    ...(folderId ? { parents: [folderId] } : {}),
  }

  const body = new Blob([
    `--${boundary}\r\n`,
    'Content-Type: application/json; charset=UTF-8\r\n\r\n',
    JSON.stringify(metadata),
    `\r\n--${boundary}\r\n`,
    'Content-Type: application/pdf\r\n\r\n',
    blob,
    `\r\n--${boundary}--`,
  ], { type: `multipart/related; boundary=${boundary}` })

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body,
  })

  if (!response.ok) {
    throw new Error(`Google Drive returned ${response.status}`)
  }

  const data = await response.json()
  return data.webViewLink || `https://drive.google.com/file/d/${data.id}/view`
}

function extractDriveFolderId(value) {
  const input = value.trim()
  if (!input) return ''

  const foldersMatch = input.match(/\/folders\/([a-zA-Z0-9_-]+)/)
  if (foldersMatch) return foldersMatch[1]

  const queryMatch = input.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  if (queryMatch) return queryMatch[1]

  return input
}
