const wishForm = document.getElementById('wish-form');
const wishInput = document.getElementById('wish-input');
const wishList = document.getElementById('wish-list');
const wishCostInput = document.getElementById('wish-cost');

let wishes = [];

wishForm.addEventListener('submit', function(event) {
    event.preventDefault();

    const titleValue = wishInput.value.trim();
    const costValue = Number(document.getElementById('wish-cost').value);
    const priorityValue = Number(document.getElementById('wish-priority').value);

    if (!titleValue) {
        wishInput.setCustomValidity('Введіть назву бажання.');
        wishInput.reportValidity();
        wishInput.setCustomValidity('');
        return;
    }

    if (!Number.isFinite(costValue) || costValue < 0) {
        wishCostInput.setCustomValidity('Вартість не може бути від’ємною.');
        wishCostInput.reportValidity();
        wishCostInput.setCustomValidity('');
        return;
    }

    const newWish = {
        id: Date.now(),
        title: titleValue,
        cost: costValue,
        priority: priorityValue,
        bought: false
    };

    wishes.push(newWish);

    renderWishes();
    wishForm.reset();

    console.log('New wish added:', newWish);
});

function renderWishes() {
    wishList.innerHTML = '';

    wishes.sort(function(a, b) {
    if (a.priority !== b.priority) {
        return a.priority - b.priority;
    }
    return a.title.localeCompare(b.title);
    });

    wishes.forEach(function(wish) {
        const wishItem = document.createElement('li');

        const article = document.createElement('article');
        article.className = 'wish-card glass';

        if (wish.bought) {
            article.classList.add('wish--bought');
        }

        const title = document.createElement('h3');
        title.className = 'wish-title';
        title.textContent = wish.title;

        const cost = document.createElement('p');
        cost.textContent = `Ціна: ${wish.cost}$`;

        const priority = document.createElement('p');
        priority.textContent = `Пріоритет: ${wish.priority}`;

        article.append(title, cost, priority);

        article.addEventListener('click', function() {
            wish.bought = !wish.bought;
            renderWishes();
        });

        wishItem.appendChild(article);
        wishList.appendChild(wishItem);
    });

    calculateTotalCost();
}

function calculateTotalCost() {
    const totalCost = wishes.reduce(function(sum, wish) {
        if (!wish.bought) {
            return sum + wish.cost;
        }

        return sum;
    }, 0);

    document.getElementById('total-cost').textContent =
        `Загальна вартість: ${totalCost}$`;
}