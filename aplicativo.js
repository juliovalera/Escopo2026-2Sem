(() => {
  'use strict';

  const dados = Array.isArray(window.DADOS_PEDAGOGICOS) ? window.DADOS_PEDAGOGICOS : [];
  const el = id => document.getElementById(id);
  const elementos = {
    pesquisa: el('pesquisa'), componente: el('componente'), anoSerie: el('anoSerie'),
    bimestre: el('bimestre'), semana: el('semana'), unidade: el('unidade'),
    apenasAulas: el('apenasAulas'), lista: el('listaResultados'), contador: el('contador'),
    mensagem: el('mensagem')
  };
  let resultadosAtuais = [];
  let timerMensagem;

  function armazenamentoLer(chave) {
    try { return window.localStorage.getItem(chave); } catch (e) { return null; }
  }
  function armazenamentoGravar(chave, valor) {
    try { window.localStorage.setItem(chave, valor); } catch (e) { /* Preferência não persistida. */ }
  }

  const ordemSeries = ['6º ano','7º ano','8º ano','9º ano','2ª série','3ª série'];

  function normalizar(texto) {
    return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function valorUtil(valor) {
    const n = normalizar(valor);
    return valor && !['n/a','na','-','–','—','x'].includes(n);
  }

  function escapar(texto) {
    return String(texto || '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  }

  function unicos(lista, campo, ordenacao) {
    const valores = [...new Set(lista.map(item => item[campo]).filter(valorUtil))];
    return valores.sort(ordenacao || ((a,b) => a.localeCompare(b, 'pt-BR', {numeric:true})));
  }

  function preencherSelect(select, valores, rotuloTodos) {
    const anterior = select.value;
    select.innerHTML = `<option value="">${escapar(rotuloTodos)}</option>` + valores.map(v => `<option value="${escapar(v)}">${escapar(v)}</option>`).join('');
    if (valores.includes(anterior)) select.value = anterior;
  }

  function baseParaOpcoes() {
    return dados.filter(item => !elementos.componente.value || item.componente === elementos.componente.value);
  }

  function atualizarOpcoes() {
    const baseComp = baseParaOpcoes();
    preencherSelect(elementos.anoSerie, unicos(baseComp, 'anoSerie', (a,b) => ordemSeries.indexOf(a)-ordemSeries.indexOf(b)), 'Todos');

    const baseSerie = baseComp.filter(i => !elementos.anoSerie.value || i.anoSerie === elementos.anoSerie.value);
    preencherSelect(elementos.bimestre, unicos(baseSerie, 'bimestre'), '3º e 4º');

    const baseBim = baseSerie.filter(i => !elementos.bimestre.value || i.bimestre === elementos.bimestre.value);
    preencherSelect(elementos.semana, unicos(baseBim, 'semana', (a,b) => Number(a)-Number(b)), 'Todas');

    const baseSemana = baseBim.filter(i => !elementos.semana.value || i.semana === elementos.semana.value);
    preencherSelect(elementos.unidade, unicos(baseSemana, 'unidade'), 'Todas');
  }

  function textoIndexado(item) {
    return normalizar(Object.values(item).join(' '));
  }

  function filtrar() {
    const termo = normalizar(elementos.pesquisa.value);
    resultadosAtuais = dados.filter(item => {
      if (elementos.apenasAulas.checked && item.tipo !== 'aula') return false;
      if (elementos.componente.value && item.componente !== elementos.componente.value) return false;
      if (elementos.anoSerie.value && item.anoSerie !== elementos.anoSerie.value) return false;
      if (elementos.bimestre.value && item.bimestre !== elementos.bimestre.value) return false;
      if (elementos.semana.value && item.semana !== elementos.semana.value) return false;
      if (elementos.unidade.value && item.unidade !== elementos.unidade.value) return false;
      if (termo && !textoIndexado(item).includes(termo)) return false;
      return true;
    }).sort((a,b) => {
      const comp = a.componente.localeCompare(b.componente,'pt-BR');
      if (comp) return comp;
      const serie = ordemSeries.indexOf(a.anoSerie)-ordemSeries.indexOf(b.anoSerie);
      if (serie) return serie;
      const bim = a.bimestre.localeCompare(b.bimestre,'pt-BR',{numeric:true});
      if (bim) return bim;
      const sem = Number(a.semana||999)-Number(b.semana||999);
      if (sem) return sem;
      return Number(a.aulaSala||999)-Number(b.aulaSala||999);
    });
    renderizar();
  }

  function montarGuia(item) {
    const linhas = [];
    const adicionar = (titulo, valor) => { if (valorUtil(valor)) linhas.push(`${titulo}:\n${String(valor).trim()}`); };
    adicionar('Componente curricular', item.componente);
    adicionar('Ano/Série', item.anoSerie);
    adicionar('Bimestre', item.bimestre);
    if (valorUtil(item.data) || valorUtil(item.semana)) adicionar('Período', [item.data, item.semana ? `Semana ${item.semana}` : ''].filter(Boolean).join(' · '));
    adicionar('Unidade', item.unidade);
    adicionar('Título da aula', item.titulo);
    adicionar('Objetivos de aprendizagem', item.objetivo);
    adicionar('Conteúdos', item.conteudos);
    if (valorUtil(item.habCompCodigo) || valorUtil(item.habCompTexto)) adicionar('Habilidade da BNCC Computação', [item.habCompCodigo,item.habCompTexto].filter(valorUtil).join('\n'));
    if (valorUtil(item.habBnccCodigo) || valorUtil(item.habBnccTexto)) adicionar('Habilidade da BNCC', [item.habBnccCodigo,item.habBnccTexto].filter(valorUtil).join('\n'));
    adicionar('Habilidades dos Parâmetros de Itinerários Formativos', item.parametrosIF);
    adicionar('Formato da aula', item.formato);
    if (normalizar(item.entregaProjeto)==='sim') adicionar('Entrega de projeto', 'Sim');
    return linhas.join('\n\n');
  }

  function campoHtml(titulo, valor, chave, destaque=false) {
    if (!valorUtil(valor)) return '';
    return `<section class="bloco-campo ${destaque?'campo-destaque':''}">
      <div class="titulo-campo"><h3>${escapar(titulo)}</h3><button type="button" class="botao-copiar" data-copiar-campo="${escapar(chave)}">Copiar</button></div>
      <p class="conteudo-campo">${escapar(valor)}</p>
    </section>`;
  }

  function cartaoHtml(item) {
    const titulo = item.titulo || item.unidade || 'Registro do calendário';
    const guia = montarGuia(item);
    return `<article class="cartao" data-id="${escapar(item.id)}">
      <details>
        <summary>
          <span class="resumo-titulo">${escapar(titulo)}</span>
          <span class="metadados">
            <span class="etiqueta destaque">${escapar(item.componente)}</span>
            <span class="etiqueta">${escapar(item.anoSerie)}</span>
            <span class="etiqueta">${escapar(item.bimestre)} bimestre</span>
            ${valorUtil(item.data)?`<span class="etiqueta">${escapar(item.data)}</span>`:''}
            ${valorUtil(item.aulaSala)?`<span class="etiqueta">Aula ${escapar(item.aulaSala)}</span>`:''}
          </span>
        </summary>
        <div class="corpo-cartao">
          <div class="acoes-cartao">
            <button type="button" class="botao-primario" data-copiar-guia>Copiar tudo para o Guia</button>
            <button type="button" class="botao-secundario" data-baixar-item>Baixar esta aula</button>
          </div>
          <div class="grade-campos">
            ${campoHtml('Unidade',item.unidade,'unidade')}
            ${campoHtml('Título',item.titulo,'titulo')}
            ${campoHtml('Objetivos de aprendizagem',item.objetivo,'objetivo',true)}
            ${campoHtml('Conteúdos',item.conteudos,'conteudos',true)}
            ${campoHtml('Habilidade da BNCC Computação — código',item.habCompCodigo,'habCompCodigo')}
            ${campoHtml('Habilidade da BNCC Computação — texto',item.habCompTexto,'habCompTexto')}
            ${campoHtml('Habilidade da BNCC — código',item.habBnccCodigo,'habBnccCodigo')}
            ${campoHtml('Habilidade da BNCC — texto',item.habBnccTexto,'habBnccTexto')}
            ${campoHtml('Parâmetros de Itinerários Formativos',item.parametrosIF,'parametrosIF')}
            ${campoHtml('Formato da aula',item.formato,'formato')}
            <section class="bloco-campo campo-destaque">
              <div class="titulo-campo"><h3>Texto organizado para o Guia de Aprendizagem</h3><button type="button" class="botao-copiar" data-copiar-guia>Copiar texto</button></div>
              <pre class="previa-guia">${escapar(guia)}</pre>
            </section>
          </div>
          <p class="fonte-registro">Fonte: ${escapar(item.fonte)}, linha ${escapar(item.linhaFonte)}.</p>
        </div>
      </details>
    </article>`;
  }

  function renderizar() {
    const total = resultadosAtuais.length;
    elementos.contador.textContent = `${total} ${total === 1 ? 'registro encontrado' : 'registros encontrados'}.`;
    if (!total) {
      elementos.lista.innerHTML = '<p class="vazio">Nenhum resultado corresponde aos filtros selecionados. Limpe um filtro ou tente outra palavra.</p>';
      return;
    }
    elementos.lista.innerHTML = resultadosAtuais.map(cartaoHtml).join('');
  }

  async function copiarTexto(texto) {
    try {
      await navigator.clipboard.writeText(texto);
    } catch (e) {
      const area = document.createElement('textarea');
      area.value = texto; area.style.position='fixed'; area.style.opacity='0';
      document.body.appendChild(area); area.focus(); area.select(); document.execCommand('copy'); area.remove();
    }
    mostrarMensagem('Conteúdo copiado. Agora é só colar no Guia de Aprendizagem.');
  }

  function mostrarMensagem(texto) {
    clearTimeout(timerMensagem);
    elementos.mensagem.textContent = texto;
    elementos.mensagem.classList.add('visivel');
    timerMensagem = setTimeout(() => elementos.mensagem.classList.remove('visivel'), 3200);
  }

  function baixar(nome, conteudo) {
    const blob = new Blob([conteudo], {type:'text/plain;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=nome; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  document.addEventListener('click', evento => {
    const cartao = evento.target.closest('.cartao');
    if (evento.target.matches('[data-copiar-campo]') && cartao) {
      const item = dados.find(i => i.id === cartao.dataset.id);
      copiarTexto(item[evento.target.dataset.copiarCampo] || '');
    }
    if (evento.target.matches('[data-copiar-guia]') && cartao) {
      const item = dados.find(i => i.id === cartao.dataset.id);
      copiarTexto(montarGuia(item));
    }
    if (evento.target.matches('[data-baixar-item]') && cartao) {
      const item = dados.find(i => i.id === cartao.dataset.id);
      baixar(`${item.componente}-${item.anoSerie}-${item.titulo||item.unidade}.txt`.replace(/[\\/:*?"<>|]/g,'-'), montarGuia(item));
    }
  });

  ['input','change'].forEach(tipo => {
    elementos.pesquisa.addEventListener(tipo, filtrar);
    elementos.apenasAulas.addEventListener(tipo, filtrar);
  });
  [elementos.componente, elementos.anoSerie, elementos.bimestre, elementos.semana, elementos.unidade].forEach(select => {
    select.addEventListener('change', () => { atualizarOpcoes(); filtrar(); });
  });

  el('limparFiltros').addEventListener('click', () => {
    elementos.pesquisa.value=''; elementos.componente.value=''; elementos.anoSerie.value=''; elementos.bimestre.value=''; elementos.semana.value=''; elementos.unidade.value=''; elementos.apenasAulas.checked=true;
    atualizarOpcoes(); filtrar(); elementos.pesquisa.focus();
  });
  el('imprimir').addEventListener('click', () => {
    document.querySelectorAll('.cartao details').forEach(d => d.open=true);
    window.print();
  });
  el('baixarSelecao').addEventListener('click', () => {
    if (!resultadosAtuais.length) return mostrarMensagem('Não há resultados para baixar.');
    baixar('selecao-guia-aprendizagem.txt', resultadosAtuais.map(montarGuia).join('\n\n'+('='.repeat(72))+'\n\n'));
  });

  function ajustarFonte(delta) {
    const atual = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const novo = Math.max(15, Math.min(24, atual + delta));
    document.documentElement.style.setProperty('--fonte-base', `${novo}px`);
    armazenamentoGravar('fonteConsultaPedagogica', novo);
  }
  el('diminuirFonte').addEventListener('click', () => ajustarFonte(-1));
  el('aumentarFonte').addEventListener('click', () => ajustarFonte(1));
  el('altoContraste').addEventListener('click', evento => {
    const ativo = document.body.classList.toggle('alto-contraste');
    evento.currentTarget.setAttribute('aria-pressed', String(ativo));
    armazenamentoGravar('contrasteConsultaPedagogica', ativo ? '1' : '0');
  });

  const fonteSalva = Number(armazenamentoLer('fonteConsultaPedagogica'));
  if (fonteSalva >= 15 && fonteSalva <= 24) document.documentElement.style.setProperty('--fonte-base', `${fonteSalva}px`);
  if (armazenamentoLer('contrasteConsultaPedagogica')==='1') {
    document.body.classList.add('alto-contraste'); el('altoContraste').setAttribute('aria-pressed','true');
  }

  preencherSelect(elementos.componente, unicos(dados,'componente'), 'Todos');
  atualizarOpcoes();
  filtrar();
})();
