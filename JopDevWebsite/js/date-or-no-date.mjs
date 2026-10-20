export const DEFAULT_DATES = Object.freeze([
  { title: 'Cozy Movie Night', description: 'Pick a favorite movie, make popcorn, and build the coziest spot in the house.', budget: '$' },
  { title: 'Homemade Pizza Night', description: 'Make personal pizzas together and compete for the best topping combination.', budget: '$' },
  { title: 'Arcade Challenge', description: 'Load up some game cards and see who can win the most tickets.', budget: '$$' },
  { title: 'Picnic for Two', description: 'Pack a few favorites, find a scenic spot, and leave the phones in the bag.', budget: '$' },
  { title: 'Coffee & Bookstore', description: 'Grab a drink, browse the shelves, and choose a book for each other.', budget: '$' },
  { title: 'Mini Golf Showdown', description: 'Play 18 holes with a fun prize waiting for the winner.', budget: '$$' },
  { title: 'Cooking Challenge', description: 'Choose a new recipe, shop for the ingredients, and make it together.', budget: '$$' },
  { title: 'Board Game Night', description: 'Pick a few games, add favorite snacks, and crown the evening champion.', budget: '$' },
  { title: 'Sunset Walk', description: 'Find a good view, take a long walk, and watch the sun go down together.', budget: 'Free' },
  { title: 'Dessert Crawl', description: 'Split one dessert at a few different places and choose the best of the night.', budget: '$$' },
  { title: 'Museum Day', description: 'Explore a museum or gallery and each choose one favorite thing you saw.', budget: '$$' },
  { title: 'Bowling Night', description: 'A few games, questionable technique, and snacks between frames.', budget: '$$' },
  { title: 'Farmers Market Morning', description: 'Browse the stalls, pick out something new, and make brunch afterward.', budget: '$' },
  { title: 'Scenic Drive', description: 'Build a playlist, choose a route, and stop anywhere that looks interesting.', budget: '$' },
  { title: 'Breakfast Date', description: 'Go out for a slow breakfast or make an over-the-top brunch at home.', budget: '$$' },
  { title: 'Thrift Store Challenge', description: 'Set a small budget and find the funniest or best gift for each other.', budget: '$' },
  { title: 'Paint Something Together', description: 'Try pottery, a paint class, or canvases at home with your own theme.', budget: '$$' },
  { title: 'Escape Room', description: 'Work together, solve the clues, and see if you can beat the clock.', budget: '$$$' },
  { title: 'Comedy Night', description: 'Find a local comedy show and spend the evening laughing together.', budget: '$$$' },
  { title: 'Surprise Day Trip', description: 'Choose a nearby town or attraction and make a full day of exploring it.', budget: '$$$' },
  { title: 'Concert Night', description: 'Pick an artist you both enjoy and turn the show into a full night out.', budget: '$$$' },
  { title: 'Weekend Getaway', description: 'Book a night away, explore somewhere new, and make a little trip of it.', budget: '$$$$' },
]);

export const ROUND_CASE_COUNTS = Object.freeze([4, 3, 3, 2, 1, 1]);

const STORAGE_KEY = 'jopdev-date-or-no-date-ideas-v1';

export function shuffle(items, random = Math.random) {
  const result = [...items];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }

  return result;
}

export function createGameCases(ideas, random = Math.random) {
  if (!Array.isArray(ideas) || ideas.length < 16) {
    throw new Error('At least 16 date ideas are required to start a game.');
  }

  return shuffle(ideas, random)
    .slice(0, 16)
    .map((idea, index) => ({
      number: index + 1,
      idea: { ...idea },
      opened: false,
    }));
}

export function getRoundCaseCount(roundIndex) {
  return ROUND_CASE_COUNTS[roundIndex] ?? 0;
}

export function chooseBankerOffer(cases, playerCaseNumber, random = Math.random) {
  const eligibleCases = cases.filter(
    (gameCase) => !gameCase.opened && gameCase.number !== playerCaseNumber,
  );

  if (eligibleCases.length === 0) {
    return null;
  }

  return eligibleCases[Math.floor(random() * eligibleCases.length)].idea;
}

function cloneDefaultDates() {
  return DEFAULT_DATES.map((idea) => ({ ...idea }));
}

function loadIdeas(storage) {
  if (!storage) {
    return cloneDefaultDates();
  }

  try {
    const saved = JSON.parse(storage.getItem(STORAGE_KEY));
    if (
      Array.isArray(saved)
      && saved.length === DEFAULT_DATES.length
      && saved.every((idea) => (
        typeof idea?.title === 'string'
        && idea.title.trim()
        && typeof idea?.description === 'string'
        && idea.description.trim()
        && typeof idea?.budget === 'string'
        && idea.budget.trim()
      ))
    ) {
      return saved.map((idea) => ({
        title: idea.title.trim().slice(0, 80),
        description: idea.description.trim().slice(0, 220),
        budget: idea.budget.trim().slice(0, 20),
      }));
    }
  } catch {
    // Invalid or unavailable storage falls back to the built-in ideas.
  }

  return cloneDefaultDates();
}

function saveIdeas(storage, ideas) {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(ideas));
  } catch {
    // The game remains usable if private browsing or storage settings block saving.
  }
}

function setText(root, selector, value) {
  const element = root.querySelector(selector);
  if (element) {
    element.textContent = value;
  }
}

export function initDateOrNoDatePage(root = globalThis.document) {
  const page = root?.querySelector?.('[data-date-game]');
  if (!page) {
    return;
  }

  const storage = globalThis.localStorage;
  const caseBoard = page.querySelector('[data-case-board]');
  const bankerDialog = root.querySelector('[data-banker-dialog]');
  const finalDialog = root.querySelector('[data-final-dialog]');
  const customizerDialog = root.querySelector('[data-customizer-dialog]');
  const customDateList = customizerDialog.querySelector('[data-custom-date-list]');
  let ideas = loadIdeas(storage);
  let game = null;

  function updateGameCopy(status, instructions) {
    setText(page, '[data-game-status]', status);
    setText(page, '[data-game-instructions]', instructions);

    const statusHeading = page.querySelector('[data-game-status]');
    statusHeading.classList.remove('is-updating');
    globalThis.requestAnimationFrame(() => {
      statusHeading.classList.add('is-updating');
      statusHeading.addEventListener(
        'animationend',
        () => statusHeading.classList.remove('is-updating'),
        { once: true },
      );
    });
  }

  function setDialogOpen(dialog, isOpen) {
    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }

  function renderBoard() {
    caseBoard.replaceChildren();

    const cases = game?.cases ?? Array.from({ length: 16 }, (_, index) => ({
      number: index + 1,
      opened: false,
      idea: null,
    }));

    cases.forEach((gameCase, index) => {
      const button = root.createElement('button');
      button.type = 'button';
      button.className = 'mystery-case';
      button.dataset.caseNumber = String(gameCase.number);
      button.style.setProperty('--case-index', String(index));

      if (game?.animateBoard) {
        button.classList.add('is-entering');
      }

      if (gameCase.opened) {
        button.classList.add('is-opened');
        button.disabled = true;
        button.setAttribute('aria-label', `Case ${gameCase.number}, revealed: ${gameCase.idea.title}`);

        const number = root.createElement('span');
        number.className = 'mystery-case-number';
        number.textContent = String(gameCase.number);

        const title = root.createElement('span');
        title.className = 'mystery-case-reveal';
        title.textContent = gameCase.idea.title;

        button.append(number, title);
      } else {
        const handle = root.createElement('span');
        handle.className = 'mystery-case-handle';
        handle.setAttribute('aria-hidden', 'true');

        const number = root.createElement('span');
        number.className = 'mystery-case-number';
        number.textContent = String(gameCase.number);

        button.append(handle, number);

        if (game?.playerCaseNumber === gameCase.number) {
          button.classList.add('is-player-case');
          button.disabled = true;
          button.setAttribute('aria-label', `Case ${gameCase.number}, your selected case`);
        } else if (!game || !['choose', 'opening'].includes(game.phase)) {
          button.disabled = true;
        } else {
          const action = game.phase === 'choose' ? 'choose' : 'open';
          button.setAttribute('aria-label', `Case ${gameCase.number}, ${action} this case`);
        }
      }

      if (game?.justSelectedCaseNumber === gameCase.number) {
        button.classList.add('is-just-selected');
      }

      if (game?.lastOpenedCaseNumber === gameCase.number) {
        button.classList.add('is-newly-opened');
      }

      caseBoard.append(button);
    });

    if (game) {
      game.animateBoard = false;
    }
  }

  function updateProgress() {
    const progress = page.querySelector('[data-game-progress]');
    const resetButton = page.querySelector('[data-reset-game]');
    progress.hidden = !game;
    resetButton.hidden = !game;

    if (!game) {
      return;
    }

    if (game.phase === 'choose') {
      setText(page, '[data-round-label]', 'Choose your case');
      setText(page, '[data-progress-count]', '16 cases');
      page.querySelector('[data-progress-bar]').style.width = '0%';
      return;
    }

    const target = getRoundCaseCount(game.roundIndex);
    const current = Math.min(game.openedThisRound, target);
    setText(page, '[data-round-label]', `Round ${Math.min(game.roundIndex + 1, 6)} of 6`);
    setText(
      page,
      '[data-progress-count]',
      game.phase === 'opening'
        ? `${current} of ${target} cases opened`
        : 'Waiting on your decision',
    );
    page.querySelector('[data-progress-bar]').style.width = `${target ? (current / target) * 100 : 100}%`;
  }

  function updatePlayerCase() {
    const number = game?.playerCaseNumber;
    setText(page, '[data-player-case-number]', number ? String(number) : '—');
    setText(page, '[data-player-case-caption]', number ? 'Locked in' : 'Not selected');
    page.querySelector('[data-player-case]').classList.toggle('is-selected', Boolean(number));
  }

  function showReveal(idea) {
    const reveal = page.querySelector('[data-last-reveal]');
    reveal.hidden = false;
    setText(reveal, '[data-last-reveal-title]', idea.title);
    setText(reveal, '[data-last-reveal-description]', idea.description);
    setText(reveal, '[data-last-reveal-budget]', idea.budget);
    reveal.classList.remove('is-entering');
    globalThis.requestAnimationFrame(() => reveal.classList.add('is-entering'));
  }

  function startGame() {
    game = {
      cases: createGameCases(ideas),
      phase: 'choose',
      playerCaseNumber: null,
      roundIndex: 0,
      openedThisRound: 0,
      animateBoard: true,
      justSelectedCaseNumber: null,
      lastOpenedCaseNumber: null,
    };

    page.classList.add('is-game-started');
    page.querySelector('[data-last-reveal]').hidden = true;
    updateGameCopy('Choose your mystery case', 'This case stays sealed while you reveal the others.');
    updatePlayerCase();
    updateProgress();
    renderBoard();
    const prefersReducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    page.querySelector('.date-game-shell').scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'start',
    });
  }

  function choosePlayerCase(caseNumber) {
    game.playerCaseNumber = caseNumber;
    game.justSelectedCaseNumber = caseNumber;
    game.phase = 'opening';
    const target = getRoundCaseCount(game.roundIndex);
    updateGameCopy(
      `Case ${caseNumber} is yours`,
      `Open ${target} other cases to complete the first round.`,
    );
    updatePlayerCase();
    updateProgress();
    renderBoard();
    const activeGame = game;
    globalThis.setTimeout(() => {
      if (game === activeGame && game.justSelectedCaseNumber === caseNumber) {
        game.justSelectedCaseNumber = null;
      }
    }, 700);
  }

  function showBankerOffer() {
    game.phase = 'offer';
    game.offer = chooseBankerOffer(game.cases, game.playerCaseNumber);
    setText(bankerDialog, '[data-offer-title]', game.offer.title);
    setText(bankerDialog, '[data-offer-description]', game.offer.description);
    setText(bankerDialog, '[data-offer-budget]', game.offer.budget);
    updateGameCopy('The Banker has an offer', 'Choose Date to take it, or No Date to continue with your case.');
    updateProgress();
    renderBoard();
    setDialogOpen(bankerDialog, true);
  }

  function openCase(caseNumber) {
    const selectedCase = game.cases.find((gameCase) => gameCase.number === caseNumber);
    if (!selectedCase || selectedCase.opened || caseNumber === game.playerCaseNumber) {
      return;
    }

    selectedCase.opened = true;
    game.lastOpenedCaseNumber = caseNumber;
    game.openedThisRound += 1;
    showReveal(selectedCase.idea);
    renderBoard();
    updateProgress();
    const activeGame = game;
    globalThis.setTimeout(() => {
      if (game === activeGame && game.lastOpenedCaseNumber === caseNumber) {
        game.lastOpenedCaseNumber = null;
      }
    }, 700);

    const target = getRoundCaseCount(game.roundIndex);
    if (game.openedThisRound >= target) {
      globalThis.setTimeout(showBankerOffer, 450);
      return;
    }

    const remaining = target - game.openedThisRound;
    updateGameCopy(
      `${selectedCase.idea.title} is off the board`,
      `Open ${remaining} more ${remaining === 1 ? 'case' : 'cases'} this round.`,
    );
  }

  function showResult(idea, heading, kicker) {
    setText(finalDialog, '[data-final-kicker]', kicker);
    setText(finalDialog, '[data-final-heading]', heading);
    finalDialog.querySelector('[data-final-copy]').hidden = true;
    finalDialog.querySelector('[data-final-choices]').hidden = true;
    finalDialog.querySelector('[data-game-result]').hidden = false;
    finalDialog.querySelector('[data-final-actions]').hidden = false;
    setText(finalDialog, '[data-result-title]', idea.title);
    setText(finalDialog, '[data-result-description]', idea.description);
    setText(finalDialog, '[data-result-budget]', idea.budget);
    updateGameCopy('Date chosen!', `${idea.title} won the game.`);
    game.phase = 'ended';
    renderBoard();
    setDialogOpen(finalDialog, true);
  }

  function acceptOffer() {
    const offer = game.offer;
    setDialogOpen(bankerDialog, false);
    showResult(offer, 'It’s a Date!', 'Deal accepted');
  }

  function declineOffer() {
    setDialogOpen(bankerDialog, false);
    game.roundIndex += 1;
    game.openedThisRound = 0;

    if (game.roundIndex >= ROUND_CASE_COUNTS.length) {
      const otherCase = game.cases.find(
        (gameCase) => !gameCase.opened && gameCase.number !== game.playerCaseNumber,
      );
      game.phase = 'final';
      game.finalOtherCaseNumber = otherCase.number;
      setText(finalDialog, '[data-final-kicker]', 'Final decision');
      setText(finalDialog, '[data-final-heading]', 'Keep your case or swap?');
      finalDialog.querySelector('[data-final-copy]').hidden = false;
      finalDialog.querySelector('[data-final-choices]').hidden = false;
      finalDialog.querySelector('[data-game-result]').hidden = true;
      finalDialog.querySelector('[data-final-actions]').hidden = true;
      setText(finalDialog, '[data-final-player-case]', `Case ${game.playerCaseNumber}`);
      setText(finalDialog, '[data-final-other-case]', `Case ${otherCase.number}`);
      updateGameCopy('Two cases remain', 'Make your final choice: keep your case or swap.');
      updateProgress();
      renderBoard();
      setDialogOpen(finalDialog, true);
      return;
    }

    game.phase = 'opening';
    const target = getRoundCaseCount(game.roundIndex);
    updateGameCopy(
      'No Date — the game continues',
      `Open ${target} ${target === 1 ? 'case' : 'cases'} in round ${game.roundIndex + 1}.`,
    );
    updateProgress();
    renderBoard();
  }

  function makeFinalChoice(choice) {
    const chosenNumber = choice === 'keep' ? game.playerCaseNumber : game.finalOtherCaseNumber;
    const chosenCase = game.cases.find((gameCase) => gameCase.number === chosenNumber);
    showResult(chosenCase.idea, 'Your mystery date is revealed!', choice === 'keep' ? 'You kept your case' : 'You made the swap');
  }

  function renderCustomizer(sourceIdeas = ideas) {
    customDateList.replaceChildren();

    sourceIdeas.forEach((idea, index) => {
      const item = root.createElement('fieldset');
      item.className = 'custom-date-item';

      const legend = root.createElement('legend');
      legend.textContent = `Date idea ${index + 1}`;

      const titleLabel = root.createElement('label');
      titleLabel.htmlFor = `custom-date-title-${index}`;
      titleLabel.textContent = 'Title';

      const titleInput = root.createElement('input');
      titleInput.id = titleLabel.htmlFor;
      titleInput.name = `title-${index}`;
      titleInput.type = 'text';
      titleInput.maxLength = 80;
      titleInput.required = true;
      titleInput.value = idea.title;

      const descriptionLabel = root.createElement('label');
      descriptionLabel.htmlFor = `custom-date-description-${index}`;
      descriptionLabel.textContent = 'Description';

      const descriptionInput = root.createElement('textarea');
      descriptionInput.id = descriptionLabel.htmlFor;
      descriptionInput.name = `description-${index}`;
      descriptionInput.maxLength = 220;
      descriptionInput.rows = 2;
      descriptionInput.required = true;
      descriptionInput.value = idea.description;

      const budgetLabel = root.createElement('label');
      budgetLabel.htmlFor = `custom-date-budget-${index}`;
      budgetLabel.textContent = 'Budget';

      const budgetInput = root.createElement('input');
      budgetInput.id = budgetLabel.htmlFor;
      budgetInput.name = `budget-${index}`;
      budgetInput.type = 'text';
      budgetInput.maxLength = 20;
      budgetInput.required = true;
      budgetInput.value = idea.budget;

      item.append(
        legend,
        titleLabel,
        titleInput,
        descriptionLabel,
        descriptionInput,
        budgetLabel,
        budgetInput,
      );
      customDateList.append(item);
    });
  }

  function openCustomizer() {
    renderCustomizer();
    setDialogOpen(customizerDialog, true);
  }

  caseBoard.addEventListener('click', (event) => {
    const caseButton = event.target.closest('[data-case-number]');
    if (!caseButton || !game) {
      return;
    }

    const caseNumber = Number(caseButton.dataset.caseNumber);
    if (game.phase === 'choose') {
      choosePlayerCase(caseNumber);
    } else if (game.phase === 'opening') {
      openCase(caseNumber);
    }
  });

  page.querySelector('[data-start-game]').addEventListener('click', startGame);
  page.querySelector('[data-reset-game]').addEventListener('click', startGame);
  page.querySelector('[data-open-customizer]').addEventListener('click', openCustomizer);
  bankerDialog.querySelector('[data-accept-offer]').addEventListener('click', acceptOffer);
  bankerDialog.querySelector('[data-decline-offer]').addEventListener('click', declineOffer);
  finalDialog.querySelector('[data-final-choices]').addEventListener('click', (event) => {
    const choice = event.target.closest('[data-final-choice]');
    if (choice) {
      makeFinalChoice(choice.dataset.finalChoice);
    }
  });
  finalDialog.querySelector('[data-play-again]').addEventListener('click', () => {
    setDialogOpen(finalDialog, false);
    startGame();
  });
  finalDialog.querySelector('[data-close-result]').addEventListener('click', () => {
    setDialogOpen(finalDialog, false);
  });

  customizerDialog.querySelectorAll('[data-close-customizer]').forEach((button) => {
    button.addEventListener('click', () => setDialogOpen(customizerDialog, false));
  });
  customizerDialog.querySelector('[data-reset-dates]').addEventListener('click', () => {
    renderCustomizer(cloneDefaultDates());
  });
  customizerDialog.querySelector('[data-customizer-form]').addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    ideas = DEFAULT_DATES.map((_, index) => ({
      title: String(formData.get(`title-${index}`)).trim(),
      description: String(formData.get(`description-${index}`)).trim(),
      budget: String(formData.get(`budget-${index}`)).trim(),
    }));
    saveIdeas(storage, ideas);
    setDialogOpen(customizerDialog, false);
  });

  bankerDialog.addEventListener('cancel', (event) => event.preventDefault());
  finalDialog.addEventListener('cancel', (event) => event.preventDefault());

  renderBoard();
}
