let toggleMenu = document.querySelector('.menu__bar');
const mobileMenu = document.querySelector(".mobile-menu");
console.log(toggleMenu);

toggleMenu.addEventListener('click', (e) => {
    mobileMenu.classList.toggle('active')
    e.preventDefault(); // prevent default behaviour
});