(() => {
  let id, data, ledgers, googleLink, googleLinkSection, insightModal, transactionSearchInput,
    transactionSearchButton, transactionSearchForm, transactionSearchResults;
  const debitThreshold = -1000;
  const creditThreshold = 1000;

  const main = () => {
    id = /app\/(.*)\/reconciliation/.exec(location.href)[1];
    fetchLedgers();
    fetchReconciliationData().then(updateTable);
    setupInsightModal();
    injectStyles();
  };

  const setupInsightModal = () => {
    googleLink = $('<a>', {
      target: 'insights',
      text: 'Google search company name »',
      click: openGoogleResults,
    });
    googleLinkSection = $('<div>', {
      'class': 'c-insight_section',
      html: [ googleLink ],
    });
    transactionSearchInput = $('<input>', {
      'class': 'c-insight_input',
    });
    transactionSearchButton = $('<button>', {
      'class': 'c-insight_submit',
      text: 'Search Transactions',
      click: searchTransactions,
    });
    transactionSearchForm = $('<form>', {
      action: `/reports/api/search/json/${id}/2014-01-01/2018-12-31`,
      'class': 'c-insight_section',
      html: [
        transactionSearchInput,
        transactionSearchButton,
      ],
    });
    transactionSearchResults = $('<div>', {
      'class': 'c-results',
    });
    insightModal = $('<div>', {
      'class': 'c-insight_modal',
      html: [
        transactionSearchForm,
        transactionSearchResults,
        googleLinkSection,
      ],
      click: () => false,
    });
    insightModal.appendTo('body').hide();
    $('body')
      .on('click', closeInsightModal)
      .on('keyup', e => { if (e.key === 'Escape') closeInsightModal(); });
  };

  const openGoogleResults = (e) => {
    window.open(e.target.href, 'insights').focus();
    return false;
  };

  const searchTransactions = () => {
    const pattern = transactionSearchInput.val();
    $.getJSON(`${transactionSearchForm.attr('action')}?page=1&results-per-page=10&pattern=${encodeURIComponent(pattern)}`)
      .then(displaySearchResults);
    return false;
  };

  const displaySearchResults = (searchResults) => {
    transactionSearchResults.empty();
    if (searchResults.page.entries.length === 0) {
      const entryContainer = $('<div>', {
        'class': 'c-results_none',
        text: 'No results',
      });
      transactionSearchResults.append(entryContainer);
      return;
    }
    searchResults.page.entries.forEach(entry => {
      const date = $('<span>', {
        'class': 'c-results_date',
        text: entry.documentDate,
      });
      const vendor = $('<span>', {
        'class': 'c-results_vendor',
        text: entry.vendor,
      });
      const debitLedger = ledgers.find(l => l.id === entry.dataEntries[0].ledgerAccountId).name;
      const creditLedger = ledgers.find(l => l.id === entry.dataEntries[1].ledgerAccountId).name;
      const account = $('<span>', {
        'class': 'c-results_ledger',
        text: `${debitLedger} › ${creditLedger}`,
      });
      const amount = makeAmountContainer(entry.amount).text(entry.amount.toFixed(2));
      const entryContainer = $('<div>', {
        'class': 'c-results_item',
        html: [
          date,
          vendor,
          account,
          amount,
        ],
      });
      transactionSearchResults.append(entryContainer);
    });
  };

  const closeInsightModal = () => {
    insightModal.hide();
    transactionSearchResults.empty();
    $('tr.active').removeClass('active');
  };

  const injectStyles = () => {
    const styles = document.createElement('link');
    styles.rel = 'stylesheet';
    styles.href = 'http://localhost:8080/styles.css';
    document.head.appendChild(styles);
  };

  const fetchReconciliationData = () => {
    return $.getJSON(`https://10sheet.ca/api/v1/reconciliation.json/${id}`)
      .then(res => data = res);
  };

  const fetchLedgers = () => {
    return $.getJSON(`https://10sheet.ca/api/v1/ledgeraccount.json/client/${id}`)
      .then(res => ledgers = res);
  };

  const updateTable = () => {
    const els = {};
    els.table = $('.reconciliation-table');
    els.tbody = els.table.find('tbody');
    els.rows = els.tbody.find('tr');
    visualizeAmounts(els);
    addInsights(els);
    showConfidence(els);
  };

  let makeAmountContainer = function (amount) {
    let percent;
    let className = 'c-amount';
    if (amount < 0) {
      className += ' -negative';
      percent = Math.min(amount / debitThreshold, 1).toFixed(5);
    }
    if (amount >= 0) {
      className += ' -positive';
      percent = Math.min(amount / creditThreshold, 1).toFixed(5);
    }
    return $('<div>', {
      'class': className,
      css: { backgroundPositionX: `-${100 * percent}px` },
    });
  };

  const visualizeAmounts = (els) => {
    els.rows.each((i, row) => {
      const id = /reconciliation_row_id_(.*)/.exec(row.id)[1];
      const txn = data.transactions.find(txn => txn.id === id);
      const amount = txn.amount;
      const amountCell = $(row).find('.amount');
      const cAmount = makeAmountContainer(amount);
      amountCell.wrapInner(cAmount);
    });
  };

  const computeConfidence = (seed) => {
    let sum = 0;
    for (let i = 0; i < seed.length; i++) {
      sum += seed[i].charCodeAt(0);
    }
    return (sum % 100) / 100;
  };

  const showConfidence = (els) => {
    els.rows.each((i, row) => {
      const id = /reconciliation_row_id_(.*)/.exec(row.id)[1];
      const txn = data.transactions.find(txn => txn.id === id);
      const $row = $(row);
      if (!$row.hasClass('categorized-state')) return;
      const statusMessage = $row.find('.status-message').text();
      let confidence = computeConfidence(txn.vendorName);
      if (statusMessage.includes('suggestion')) {
        confidence = (confidence * 50) + 40;
      } else if (statusMessage.includes('prediction')) {
        confidence = (confidence * 10) + 90;
      } else {
        return;
      }
      let level = Math.round(confidence / 20);
      const confidenceIcon = $('<span>', {
        'class': `c-confidence_icon -p${level}`,
        text: `${Math.round(confidence)}%`,
      });
      $row.find('.status-icon').replaceWith(confidenceIcon);
    });
  };

  const addInsights = (els) => {
    els.rows.each((i, row) => {
      const id = /reconciliation_row_id_(.*)/.exec(row.id)[1];
      const txn = data.transactions.find(txn => txn.id === id);
      const $row = $(row);
      const insightButton = $('<div>', {
        'class': 'c-insight_button',
        click: (e) => {
          e.stopPropagation();
          const rect = e.target.getBoundingClientRect();
          closeInsightModal();
          $row.addClass('active');
          googleLink.attr('href', `https://www.google.com/search?q=${encodeURIComponent(txn.vendorName)}`);
          transactionSearchInput.val(txn.vendorName);
          insightModal.css({
            left: rect.x + (rect.width / 2),
            top: e.pageY,
          }).fadeIn('fast');
        },
      });

      $row.find('.vendor').append(insightButton);
    });
  };

  main();

})();
