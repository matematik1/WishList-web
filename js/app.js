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
        article.className = 'glass';

        if (wish.bought) {
            article.classList.add('wish--bought');
        }

        article.innerHTML = `
            <h3 class="wish-title">${wish.title}</h3>
            <p>Ціна: ${wish.cost}$</p>
            <p>Пріоритет: ${wish.priority}</p>
        `;

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