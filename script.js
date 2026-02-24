/* RESET E FUNDAMENTOS */
* { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
body { background-color: #f4f7f6; color: #333; }

/* CABEÇALHO (TOPBAR) */
.topbar { background-color: #2b3d51; color: white; padding: 15px 20px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 5px rgba(0,0,0,0.1); height: 60px; }
.topbar-logo { font-size: 18px; font-weight: bold; }
.topbar-user { font-size: 14px; }

/* ESTRUTURA PRINCIPAL */
.app-container { display: flex; height: calc(100vh - 60px); overflow: hidden; }

/* MENU LATERAL */
.sidebar { width: 250px; background-color: #34495e; color: white; padding-top: 20px; overflow-y: auto; }
.sidebar ul { list-style: none; }
.menu-section { padding: 10px 20px; font-size: 12px; color: #95a5a6; font-weight: bold; margin-top: 10px; text-transform: uppercase; }
.menu-btn { width: 100%; text-align: left; background: none; border: none; color: #ecf0f1; padding: 12px 20px; cursor: pointer; transition: 0.2s; font-size: 14px; }
.menu-btn:hover { background-color: #2c3e50; border-left: 4px solid #337ab7; }
.menu-btn.ativo { background-color: #2c3e50; border-left: 4px solid #337ab7; font-weight: bold; color: #fff; }

/* ÁREA DE CONTEÚDO E SEÇÕES */
.content { flex: 1; padding: 30px; overflow-y: auto; }
.card { background: white; padding: 25px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); }
.header-lista { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 2px solid #eee; padding-bottom: 10px; }
.header-lista h2 { color: #2b3d51; }

/* FERRAMENTAS: IMPORT, EXPORT, BUSCA E PAGINAÇÃO */
.toolbar { display: flex; justify-content: space-between; background: #f8f9fa; padding: 10px 15px; border-radius: 4px; margin-bottom: 15px; align-items: center; border: 1px solid #e0e0e0; }
.import-group, .export-group { display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: bold; color: #555; }
.controles-tabela { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; font-size: 13px; font-weight: bold; color: #555; }
.search-box input { padding: 8px; border: 1px solid #ccc; border-radius: 4px; width: 300px; font-size: 14px; }
.paginacao { margin-top: 20px; display: flex; justify-content: center; align-items: center; gap: 15px; font-weight: bold; color: #555; }
.paginacao button { background: #e0e0e0; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer; transition: 0.2s; }
.paginacao button:hover { background: #d0d0d0; }

/* TABELA GOVERNAMENTAL (.tabela-gov) */
.tabela-gov { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 14px; }
.tabela-gov th { background-color: #f8f9fa; color: #2b3d51; padding: 12px; text-align: left; border: 1px solid #dee2e6; font-weight: bold; }
.tabela-gov td { padding: 10px 12px; border: 1px solid #dee2e6; }
.tabela-gov tr:nth-child(even) { background-color: #fdfdfd; }
.tabela-gov tr:hover { background-color: #f1f5f9; }

/* FORMULÁRIOS E LAYOUT FLEX (.form-row, .flex-1, etc) */
.form-row { display: flex; gap: 15px; margin-bottom: 15px; }
.form-group { display: flex; flex-direction: column; }
.flex-1 { flex: 1; }
.flex-2 { flex: 2; }
.form-group label { font-size: 13px; font-weight: bold; margin-bottom: 5px; color: #555; }
.form-group input, .form-group select { padding: 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; }
.form-group input:focus, .form-group select:focus { border-color: #337ab7; outline: none; box-shadow: 0 0 5px rgba(51,122,183,0.3); }

/* ESTILOS ESPECIAIS DE FORMULÁRIO (.gov-fieldset, .input-readonly) */
.gov-fieldset { border: 1px solid #ccc; border-radius: 6px; padding: 20px; margin-bottom: 20px; background-color: #fff; }
.gov-fieldset legend { font-weight: bold; color: #337ab7; padding: 0 10px; font-size: 15px; }
.input-readonly { background-color: #eef2f5 !important; border-color: #d1d9e0 !important; color: #555; cursor: not-allowed; font-weight: bold; }
.autocomplete-list { position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #ccc; border-radius: 0 0 4px 4px; z-index: 1000; list-style: none; max-height: 200px; overflow-y: auto; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
.autocomplete-list li { padding: 10px; border-bottom: 1px solid #eee; cursor: pointer; font-size: 13px; }
.autocomplete-list li:hover { background-color: #f1f5f9; }

/* BADGES (Rascunho, etc) */
.badge-status { padding: 5px 12px; border-radius: 12px; font-size: 12px; font-weight: bold; color: white; display: inline-block; }
.rascunho { background-color: #f39c12; }

/* BOTÕES */
.form-acoes { margin-top: 25px; padding-top: 15px; border-top: 1px solid #eee; display: flex; gap: 10px; }
.btn-primary { background-color: #337ab7; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-weight: bold; transition: 0.3s; }
.btn-primary:hover { background-color: #286090; }
.btn-default { background-color: #6c757d; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-weight: bold; }
.btn-default:hover { background-color: #5a6268; }
.btn-outline { background-color: transparent; color: #337ab7; border: 1px solid #337ab7; padding: 8px 15px; border-radius: 4px; cursor: pointer; font-weight: bold; }
.btn-outline:hover { background-color: #337ab7; color: white; }
.btn-small { padding: 6px 12px; font-size: 12px; }
.btn-icon { background: none; border: none; cursor: pointer; font-size: 16px; margin: 0 3px; }

/* MODAL GLOBAL */
.modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 9999; }
.modal-content { background: white; padding: 30px; border-radius: 8px; width: 90%; max-width: 500px; text-align: center; box-shadow: 0 5px 15px rgba(0,0,0,0.3); }
