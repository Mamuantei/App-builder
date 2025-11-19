/* AppBuilder — client-side page builder
   - Drag components to canvas
   - Select components and edit properties
   - Reorder components by drag & drop
   - Live preview via generated HTML
   - Export project as ZIP (HTML/CSS/JS) using JSZip
   - Save/load project in localStorage
*/

(() => {
  // Helpers
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from((r||document).querySelectorAll(s));
  const uid = (p='n') => `${p}_${Math.random().toString(36).slice(2,9)}`;

  // Elements
  const components = $('#components');
  const canvas = $('#canvas');
  const props = $('#props');
  const previewBtn = $('#previewBtn');
  const previewModal = $('#previewModal');
  const previewFrame = $('#previewFrame');
  const closePreview = $('#closePreview');
  const exportBtn = $('#exportBtn');
  const saveBtn = $('#saveBtn'), loadBtn = $('#loadBtn'), clearBtn = $('#clearBtn');
  const toggleGrid = $('#toggleGrid'), undoBtn = $('#undoBtn');
  const projectTitle = $('#projectTitle'), primaryColor = $('#primaryColor');

  // State
  let project = { title: 'My App', primaryColor: '#0b75d1', nodes: [] };
  let selectedId = null;
  let history = [];

  // Persist keys
  const LS = 'appbuilder_project_v1';

  // Component templates
  function createNode(type, opts = {}) {
    const id = opts.id || uid(type);
    const base = { id, type, props: {}, children: [] };

    switch(type){
      case 'section':
        base.props = { padding: '24', bgcolor: '' };
        base.children = [];
        break;
      case 'header':
        base.props = { text: 'Welcome to My App', tag: 'h1', align: 'left' };
        break;
      case 'text':
        base.props = { text: 'This is a text block. Edit me!', size: '16', align: 'left' };
        break;
      case 'image':
        base.props = { src: 'https://picsum.photos/seed/'+(Math.random()*1000|0)+'/800/400', alt: 'Image', fit: 'cover' };
        break;
      case 'button':
        base.props = { text: 'Click me', href: '#', style: 'primary' };
        break;
      case 'card':
        base.props = { title: 'Card title', text: 'Card description', img: 'https://picsum.photos/seed/'+(Math.random()*1000|0)+'/400/240' };
        break;
      case 'form':
        base.props = { title: 'Contact us', fields: [{name:'name',label:'Name',type:'text'},{name:'email',label:'Email',type:'email'}], submitText:'Send' };
        break;
      case 'cols-2':
      case 'cols-3':
        const cols = type === 'cols-2' ? 2 : 3;
        base.type = 'cols';
        base.props = { gap: '12' };
        base.children = new Array(cols).fill(0).map(()=> createNode('section', { id: uid('col') }));
        break;
      default:
        base.props = {};
    }
    return base;
  }

  // Render functions
  function renderCanvas(){
    canvas.innerHTML = '';
    if(!project.nodes.length){
      const hint = document.createElement('div');
      hint.className = 'canvas-hint';
      hint.textContent = 'Drop components here — start building 👷‍♀️';
      canvas.appendChild(hint);
      return;
    }
    project.nodes.forEach(node => {
      canvas.appendChild(renderNode(node));
    });
  }

  function renderNode(node){
    const el = document.createElement('div');
    el.className = 'node';
    el.draggable = true;
    el.dataset.id = node.id;
    el.dataset.type = node.type;

    // node content by type
    if(node.type === 'section'){
      el.innerHTML = `<div style="min-height:40px">Section</div>`;
    } else if(node.type === 'header'){
      el.innerHTML = `<${node.props.tag || 'h1'} style="margin:0">${escape(node.props.text)}</${node.props.tag || 'h1'}>`;
    } else if(node.type === 'text'){
      el.innerHTML = `<div style="font-size:${node.props.size || 16}px;text-align:${node.props.align||'left'}">${escape(node.props.text)}</div>`;
    } else if(node.type === 'image'){
      el.innerHTML = `<img src="${node.props.src}" alt="${escape(node.props.alt||'')}" style="width:100%;height:200px;object-fit:${node.props.fit||'cover'};border-radius:8px" />`;
    } else if(node.type === 'button'){
      el.innerHTML = `<button class="ab-btn ${node.props.style||'primary'}">${escape(node.props.text)}</button>`;
    } else if(node.type === 'card'){
      el.innerHTML = `
        <div style="display:flex;flex-direction:column;">
          <img src="${node.props.img}" style="width:100%;height:140px;object-fit:cover;border-radius:8px" />
          <div style="padding:8px 0">
            <div style="font-weight:700">${escape(node.props.title)}</div>
            <div class="muted" style="font-size:13px">${escape(node.props.text)}</div>
          </div>
        </div>`;
    } else if(node.type === 'form'){
      el.innerHTML = `<div><strong>${escape(node.props.title)}</strong><div class="muted" style="font-size:13px;margin-top:6px">${node.props.fields.map(f=>f.label).join(' • ')}</div></div>`;
    } else if(node.type === 'cols'){
      el.style.display = 'block';
      el.innerHTML = '';
      const colsWrap = document.createElement('div');
      colsWrap.style.display = 'flex';
      colsWrap.style.gap = (node.props.gap || 12) + 'px';
      node.children.forEach(child => {
        const cdiv = document.createElement('div');
        cdiv.className = 'col';
        cdiv.appendChild(renderNode(child));
        colsWrap.appendChild(cdiv);
      });
      el.appendChild(colsWrap);
    } else {
      el.textContent = node.type;
    }

    // actions
    const actions = document.createElement('div');
    actions.className = 'node-actions';
    actions.innerHTML = `<button title="select">✎</button><button title="delete">🗑</button>`;
    el.appendChild(actions);

    // selection highlight
    if(selectedId === node.id) el.classList.add('sel');

    // events
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      selectNode(node.id);
    });

    // action buttons
    const [selBtn, delBtn] = actions.querySelectorAll('button');
    selBtn.addEventListener('click', (ev) => { ev.stopPropagation(); selectNode(node.id); });
    delBtn.addEventListener('click', (ev) => { ev.stopPropagation(); removeNode(node.id); });

    // drag events for reorder
    el.addEventListener('dragstart', (ev) => {
      ev.dataTransfer.setData('text/node-id', node.id);
      ev.dataTransfer.effectAllowed = 'move';
      el.classList.add('dragging');
    });
    el.addEventListener('dragend', () => el.classList.remove('dragging'));

    // allow dropping onto node to place new nodes inside sections or between
    el.addEventListener('dragover', (ev) => { ev.preventDefault(); ev.dataTransfer.dropEffect = 'move'; el.classList.add('drag-over'); });
    el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
    el.addEventListener('drop', (ev) => {
      ev.preventDefault(); el.classList.remove('drag-over');
      const d = ev.dataTransfer.getData('text/comp-type') || ev.dataTransfer.getData('text/node-id');
      if(!d) return;
      if(ev.dataTransfer.getData('text/comp-type')) {
        // dropped a new component
        const newNode = createNode(d);
        // if target is a col (child of cols), insert into that child
        if(node.type === 'cols') {
          // if dropped on cols container, push to first child
          node.children[0].children = node.children[0].children || [];
          node.children[0].children.push(newNode);
        } else if(node.type === 'section') {
          node.children = node.children || [];
          node.children.push(newNode);
        } else {
          // insert after this node in top-level
          insertAfter(node.id, newNode);
        }
      } else {
        // move existing node id
        const movingId = d;
        if(movingId === node.id) return;
        moveNode(movingId, node.id);
      }
      saveHistory();
      renderAll();
    });

    return el;
  }

  // Escape helper
  function escape(s=''){ return String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }

  // Canvas drop to append
  canvas.addEventListener('dragover', (ev) => { ev.preventDefault(); ev.dataTransfer.dropEffect = 'copy'; canvas.classList.add('drag-over'); });
  canvas.addEventListener('dragleave', () => canvas.classList.remove('drag-over'));
  canvas.addEventListener('drop', (ev) => {
    ev.preventDefault(); canvas.classList.remove('drag-over');
    const compType = ev.dataTransfer.getData('text/comp-type');
    const nodeId = ev.dataTransfer.getData('text/node-id');
    if(compType){
      project.nodes.push(createNode(compType));
    } else if(nodeId){
      // move node to end
      moveNode(nodeId, null);
    }
    saveHistory();
    renderAll();
  });

  // Make palette items draggable
  $$('.comp', components).forEach(c => {
    c.addEventListener('dragstart', (ev) => {
      ev.dataTransfer.setData('text/comp-type', c.dataset.type);
      ev.dataTransfer.effectAllowed = 'copy';
    });
    c.addEventListener('click', () => {
      // click to add as well
      project.nodes.push(createNode(c.dataset.type));
      saveHistory(); renderAll();
    });
  });

  // Insert after a node in top-level
  function insertAfter(targetId, newNode){
    const i = project.nodes.findIndex(n=>n.id===targetId);
    if(i === -1) project.nodes.push(newNode);
    else project.nodes.splice(i+1, 0, newNode);
  }

  // Move node (top-level). If afterId null => move to end.
  function moveNode(nodeId, afterId){
    // find and remove node
    const idx = project.nodes.findIndex(n=>n.id===nodeId);
    if(idx === -1) return;
    const [node] = project.nodes.splice(idx,1);
    if(afterId === null) { project.nodes.push(node); return; }
    const j = project.nodes.findIndex(n=>n.id===afterId);
    if(j === -1) project.nodes.push(node); else project.nodes.splice(j+1, 0, node);
  }

  // Find node by id (top-level)
  function findNode(id){ return project.nodes.find(n=>n.id===id); }

  // Remove node
  function removeNode(id){
    project.nodes = project.nodes.filter(n=>n.id !== id);
    if(selectedId === id) selectedId = null;
    saveHistory();
    renderAll();
  }

  // Selection and properties editing
  function selectNode(id){
    selectedId = id;
    renderAll();
    showProperties(id);
  }

  function showProperties(id){
    const node = findNode(id);
    if(!node){
      props.innerHTML = `<div class="muted">No component selected.</div>`;
      return;
    }
    // Build form dynamically based on node.type
    let html = `<div style="font-weight:700;margin-bottom:8px">${escape(node.type)} — ${escape(node.id)}</div>`;
    if(node.type === 'header'){
      html += `<label>Text<input type="text" id="prop_text" value="${escapeAttr(node.props.text||'')}" /></label>`;
      html += `<label>Tag<select id="prop_tag"><option value="h1">H1</option><option value="h2">H2</option><option value="h3">H3</option></select></label>`;
      html += `<label>Align<select id="prop_align"><option>left</option><option>center</option><option>right</option></select></label>`;
    } else if(node.type === 'text'){
      html += `<label>Text<textarea id="prop_text">${escapeAttr(node.props.text||'')}</textarea></label>`;
      html += `<label>Font size (px)<input id="prop_size" type="number" value="${node.props.size||16}" /></label>`;
      html += `<label>Align<select id="prop_align"><option>left</option><option>center</option><option>right</option></select></label>`;
    } else if(node.type === 'image'){
      html += `<label>Image URL<input id="prop_src" type="url" value="${escapeAttr(node.props.src||'')}" /></label>`;
      html += `<label>Alt text<input id="prop_alt" type="text" value="${escapeAttr(node.props.alt||'')}" /></label>`;
      html += `<label>Object-fit<select id="prop_fit"><option>cover</option><option>contain</option><option>none</option></select></label>`;
    } else if(node.type === 'button'){
      html += `<label>Text<input id="prop_text" type="text" value="${escapeAttr(node.props.text||'')}" /></label>`;
      html += `<label>Href<input id="prop_href" type="url" value="${escapeAttr(node.props.href||'')}" /></label>`;
      html += `<label>Style<select id="prop_style"><option value="primary">Primary</option><option value="secondary">Secondary</option></select></label>`;
    } else if(node.type === 'card'){
      html += `<label>Title<input id="prop_title" type="text" value="${escapeAttr(node.props.title||'')}" /></label>`;
      html += `<label>Text<textarea id="prop_text">${escapeAttr(node.props.text||'')}</textarea></label>`;
      html += `<label>Image URL<input id="prop_img" type="url" value="${escapeAttr(node.props.img||'')}" /></label>`;
    } else if(node.type === 'form'){
      html += `<label>Title<input id="prop_title" type="text" value="${escapeAttr(node.props.title||'')}" /></label>`;
      html += `<label>Submit text<input id="prop_submit" type="text" value="${escapeAttr(node.props.submitText||'Send')}" /></label>`;
      html += `<div style="margin-top:8px"><button id="addField" class="btn small">Add field</button></div>`;
      html += `<div id="fieldsList" style="margin-top:10px"></div>`;
    } else if(node.type === 'section'){
      html += `<label>Padding (px)<input id="prop_padding" type="number" value="${escapeAttr(node.props.padding||24)}" /></label>`;
      html += `<label>Background color<input id="prop_bg" type="color" value="${escapeAttr(node.props.bgcolor||'#ffffff')}" /></label>`;
    } else if(node.type === 'cols'){
      html += `<label>Column gap (px)<input id="prop_gap" type="number" value="${escapeAttr(node.props.gap||12)}" /></label>`;
      html += `<div class="muted" style="margin-top:8px">Select child column to edit its contents.</div>`;
    } else {
      html += `<div class="muted">No editable properties for this component.</div>`;
    }

    html += `<div style="margin-top:12px"><button id="applyProps" class="btn primary">Apply</button> <button id="deselect" class="btn">Deselect</button></div>`;

    props.innerHTML = html;

    // populate selects with current values
    const setSelect = (id, val) => { const el = $('#'+id); if(el) el.value = val; };
    if(node.type === 'header') {
      setSelect('prop_tag', node.props.tag || 'h1');
      setSelect('prop_align', node.props.align || 'left');
    }
    if(node.type === 'text') setSelect('prop_align', node.props.align || 'left');
    if(node.type === 'image') setSelect('prop_fit', node.props.fit || 'cover');
    if(node.type === 'button') setSelect('prop_style', node.props.style || 'primary');
    if(node.type === 'cols') setSelect('prop_gap', node.props.gap || 12);

    // form fields management
    if(node.type === 'form'){
      renderFieldsList(node);
      $('#addField').addEventListener('click', (e) => {
        e.preventDefault();
        node.props.fields.push({name: 'field'+(node.props.fields.length+1), label: 'New field', type: 'text'});
        renderFieldsList(node);
      });
    }

    // Apply handler
    $('#applyProps').addEventListener('click', () => {
      applyPropsToNode(node);
      saveHistory();
      renderAll();
    });
    $('#deselect').addEventListener('click', () => { selectedId = null; renderAll(); props.innerHTML = `<div class="muted">Select a component to edit.</div>`; });
  }

  function renderFieldsList(node){
    const out = $('#fieldsList');
    out.innerHTML = '';
    node.props.fields.forEach((f, idx) => {
      const frag = document.createElement('div');
      frag.style.display = 'flex'; frag.style.gap = '6px'; frag.style.marginBottom = '6px';
      frag.innerHTML = `<input data-idx="${idx}" class="f-label" placeholder="Label" value="${escapeAttr(f.label||'')}" />
                        <select data-idx="${idx}" class="f-type"><option value="text">text</option><option value="email">email</option><option value="textarea">textarea</option></select>
                        <button data-del="${idx}" class="btn small">Del</button>`;
      out.appendChild(frag);
    });
    // set types
    $$('.f-type', out).forEach((sel,i)=> sel.value = node.props.fields[i].type || 'text');
    // listeners
    $$('.f-label', out).forEach(inp => inp.addEventListener('input', (e) => {
      const i = +e.target.dataset.idx; node.props.fields[i].label = e.target.value;
    }));
    $$('.f-type', out).forEach(sel => sel.addEventListener('change', (e) => {
      const i = +e.target.dataset.idx; node.props.fields[i].type = e.target.value;
    }));
    $$('[data-del]', out).forEach(btn => btn.addEventListener('click', (e) => {
      const i = +e.target.dataset.del; node.props.fields.splice(i,1); renderFieldsList(node);
    }));
  }

  function applyPropsToNode(node){
    if(node.type === 'header'){
      node.props.text = $('#prop_text').value;
      node.props.tag = $('#prop_tag').value;
      node.props.align = $('#prop_align').value;
    } else if(node.type === 'text'){
      node.props.text = $('#prop_text').value;
      node.props.size = Number($('#prop_size').value) || 16;
      node.props.align = $('#prop_align').value;
    } else if(node.type === 'image'){
      node.props.src = $('#prop_src').value || node.props.src;
      node.props.alt = $('#prop_alt').value;
      node.props.fit = $('#prop_fit').value;
    } else if(node.type === 'button'){
      node.props.text = $('#prop_text').value;
      node.props.href = $('#prop_href').value;
      node.props.style = $('#prop_style').value;
    } else if(node.type === 'card'){
      node.props.title = $('#prop_title').value;
      node.props.text = $('#prop_text').value;
      node.props.img = $('#prop_img').value;
    } else if(node.type === 'form'){
      node.props.title = $('#prop_title').value;
      node.props.submitText = $('#prop_submit').value;
      // fields already mutated in-place
    } else if(node.type === 'section'){
      node.props.padding = $('#prop_padding').value;
      node.props.bgcolor = $('#prop_bg').value;
    } else if(node.type === 'cols'){
      node.props.gap = $('#prop_gap').value;
    }
  }

  // render all: canvas + props highlight etc.
  function renderAll(){
    renderCanvas();
    // reflect selection
    $$('.node').forEach(el => {
      if(el.dataset.id === selectedId) el.classList.add('sel'); else el.classList.remove('sel');
    });
    // project meta
    project.title = projectTitle.value || project.title;
    project.primaryColor = primaryColor.value || project.primaryColor;
  }

  // select empty canvas to deselect nodes
  canvas.addEventListener('click', (e) => {
    if(e.target === canvas) {
      selectedId = null;
      props.innerHTML = `<div class="muted">Select a component on the canvas to edit its properties.</div>`;
      renderAll();
    }
  });

  // Undo stack (simple)
  function saveHistory(){
    history.push(JSON.stringify(project));
    if(history.length > 30) history.shift();
  }
  undoBtn.addEventListener('click', () => {
    if(history.length < 2) return alert('No more undo steps');
    history.pop(); // current
    const prev = history.pop();
    project = JSON.parse(prev);
    history.push(JSON.stringify(project));
    selectedId = null;
    renderAll();
  });

  // Export: generate simple HTML/CSS/JS and zip
  exportBtn.addEventListener('click', async () => {
    const zip = new JSZip();
    const html = generateExportHTML();
    const css = generateExportCSS();
    const js = generateExportJS();

    zip.file('index.html', html);
    zip.file('styles.css', css);
    zip.file('script.js', js);

    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = (project.title || 'app') + '.zip';
    a.click();
    URL.revokeObjectURL(url);
  });

  // Save/load project
  saveBtn.addEventListener('click', () => {
    localStorage.setItem(LS, JSON.stringify(project));
    alert('Project saved locally.');
  });
  loadBtn.addEventListener('click', () => {
    const raw = localStorage.getItem(LS);
    if(!raw) return alert('No saved project found.');
    project = JSON.parse(raw);
    projectTitle.value = project.title || projectTitle.value;
    primaryColor.value = project.primaryColor || primaryColor.value;
    saveHistory();
    renderAll();
    alert('Project loaded.');
  });
  clearBtn.addEventListener('click', () => {
    if(!confirm('Clear canvas and project?')) return;
    project = { title: 'My App', primaryColor: primaryColor.value || '#0b75d1', nodes: [] };
    selectedId = null;
    saveHistory();
    renderAll();
  });

  // Preview
  previewBtn.addEventListener('click', () => {
    const html = generateExportHTML();
    // put the HTML into srcdoc of iframe
    previewFrame.srcdoc = html;
    previewModal.classList.remove('hidden');
  });
  closePreview.addEventListener('click', () => previewModal.classList.add('hidden'));
  previewModal.addEventListener('click', (e) => { if(e.target === previewModal) previewModal.classList.add('hidden'); });

  // Toggle grid
  toggleGrid.addEventListener('click', () => canvas.classList.toggle('grid'));

  // Utility: generate export HTML
  function generateExportHTML(){
    const body = renderNodesToHTML(project.nodes);
    const cssHref = 'styles.css';
    const jsHref = 'script.js';
    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeAttr(project.title || 'My App')}</title>
<link rel="stylesheet" href="${cssHref}">
</head>
<body>
  <main class="site-root">
    ${body}
  </main>
<script src="${jsHref}"></script>
</body>
</html>`;
    return html;
  }

  // Render nodes into HTML string (recursively)
  function renderNodesToHTML(nodes){
    return nodes.map(n => renderNodeToHTML(n)).join('\n');
  }

  function renderNodeToHTML(n){
    if(n.type === 'section'){
      const style = `padding:${n.props.padding||24}px;${n.props.bgcolor ? 'background:'+n.props.bgcolor+';' : ''}`;
      const children = (n.children||[]).map(renderNodeToHTML).join('');
      return `<section style="${style}">${children}</section>`;
    } else if(n.type === 'header'){
      const tag = n.props.tag || 'h1';
      const align = n.props.align || 'left';
      return `<${tag} style="text-align:${align}">${escapeAttr(n.props.text||'')}</${tag}>`;
    } else if(n.type === 'text'){
      return `<div style="font-size:${n.props.size||16}px;text-align:${n.props.align||'left'}">${escapeAttr(n.props.text||'')}</div>`;
    } else if(n.type === 'image'){
      return `<img src="${escapeAttr(n.props.src||'')}" alt="${escapeAttr(n.props.alt||'')}" style="width:100%;height:auto;object-fit:${n.props.fit||'cover'};border-radius:8px" />`;
    } else if(n.type === 'button'){
      const cls = `ab-btn ${n.props.style||'primary'}`;
      return `<a class="${cls}" href="${escapeAttr(n.props.href||'#')}">${escapeAttr(n.props.text||'Click')}</a>`;
    } else if(n.type === 'card'){
      return `<div class="card"><img src="${escapeAttr(n.props.img||'')}" alt="" /><div class="card-body"><h3>${escapeAttr(n.props.title||'')}</h3><p>${escapeAttr(n.props.text||'')}</p></div></div>`;
    } else if(n.type === 'form'){
      const fields = (n.props.fields||[]).map(f => {
        if(f.type === 'textarea') return `<label>${escapeAttr(f.label)}<textarea name="${escapeAttr(f.name)}"></textarea></label>`;
        return `<label>${escapeAttr(f.label)}<input type="${escapeAttr(f.type||'text')}" name="${escapeAttr(f.name)}" /></label>`;
      }).join('');
      return `<form class="simple-form"><h3>${escapeAttr(n.props.title||'Form')}</h3>${fields}<button type="submit">${escapeAttr(n.props.submitText||'Send')}</button></form>`;
    } else if(n.type === 'cols'){
      const gap = n.props.gap || 12;
      const cols = (n.children||[]).map(c => `<div class="export-col">${renderNodesToHTML(c.children||[])}</div>`).join('');
      return `<div class="export-cols" style="display:flex;gap:${gap}px">${cols}</div>`;
    } else {
      return `<div>${escapeAttr(n.type||'')}</div>`;
    }
  }

  // Export CSS
  function generateExportCSS(){
    const primary = project.primaryColor || '#0b75d1';
    return `:root{--primary:${primary}}
body{font-family:Inter,system-ui,Arial,Helvetica,sans-serif;margin:0;background:#f7fbff;color:#102027;padding:20px}
.site-root{max-width:1100px;margin:0 auto}
.ab-btn{display:inline-block;padding:10px 14px;border-radius:8px;text-decoration:none;color:#fff;background:var(--primary)}
.ab-btn.secondary{background:#f3f6fb;color:#0b5aa0;border:1px solid #e6f0fb}
.card{background:#fff;border-radius:10px;overflow:hidden;border:1px solid #eef6ff;margin-bottom:12px}
.card img{width:100%;height:160px;object-fit:cover}
.card-body{padding:12px}
.simple-form{display:flex;flex-direction:column;gap:8px}
.simple-form input,.simple-form textarea{padding:8px;border-radius:8px;border:1px solid #e6eff8}
.export-cols .export-col{flex:1}
@media (max-width:800px){ .export-cols{flex-direction:column} }`;
  }

  // Export JS (small behavior for forms)
  function generateExportJS(){
    return `// Minimal interactions
document.addEventListener('submit', function(e){
  if(e.target.matches('.simple-form')){
    e.preventDefault();
    alert('Form submitted (demo).');
    e.target.reset();
  }
});`;
  }

  // Save initial history
  saveHistory();

  // simple helper to escape attributes for generated content
  function escapeAttr(s=''){ return String(s||'').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // utility to render UI nodes from project
  function renderCanvasFallback(){ renderCanvas(); }

  // initial UI wiring
  projectTitle.value = project.title;
  primaryColor.value = project.primaryColor;

  // update project meta when inputs change
  projectTitle.addEventListener('input', (e) => { project.title = e.target.value; });
  primaryColor.addEventListener('input', (e) => { project.primaryColor = e.target.value; });

  // initial render
  renderAll();

  // expose minimal debugging API
  window.AppBuilder = {
    getProject: () => JSON.parse(JSON.stringify(project)),
    loadProject: (p) => { project = p; renderAll(); },
    clear: () => { project = { title:'My App', primaryColor:'#0b75d1', nodes:[] }; renderAll(); }
  };

  // initial demo: add one header + text
  project.nodes.push(createNode('header'));
  project.nodes.push(createNode('text'));
  saveHistory();
  renderAll();

  // small UX: allow dragging existing nodes by providing node-id dataTransfer
  document.addEventListener('dragstart', (ev) => {
    const node = ev.target.closest('.node');
    if(node && node.dataset.id){
      ev.dataTransfer.setData('text/node-id', node.dataset.id);
      ev.dataTransfer.effectAllowed = 'move';
    }
  });

})();
