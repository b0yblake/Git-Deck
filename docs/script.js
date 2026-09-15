/* global document, window, navigator, IntersectionObserver */

document.documentElement.classList.add('js')

const header = document.querySelector('[data-header]')
const menuButton = document.querySelector('[data-menu-toggle]')
const mobileNav = document.querySelector('[data-mobile-nav]')

const closeMenu = () => {
  header?.classList.remove('menu-open')
  document.body.classList.remove('menu-open')
  menuButton?.setAttribute('aria-expanded', 'false')
  menuButton?.setAttribute('aria-label', 'Open navigation')
}

menuButton?.addEventListener('click', () => {
  const willOpen = !header?.classList.contains('menu-open')
  header?.classList.toggle('menu-open', willOpen)
  document.body.classList.toggle('menu-open', willOpen)
  menuButton.setAttribute('aria-expanded', String(willOpen))
  menuButton.setAttribute('aria-label', willOpen ? 'Close navigation' : 'Open navigation')
})

mobileNav?.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu))

window.addEventListener(
  'scroll',
  () => header?.classList.toggle('scrolled', window.scrollY > 16),
  { passive: true },
)

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible')
        revealObserver.unobserve(entry.target)
      }
    })
  },
  { threshold: 0.12 },
)

document.querySelectorAll('.reveal').forEach((element) => revealObserver.observe(element))

const navLinks = [...document.querySelectorAll('.desktop-nav a')]
const sectionObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return
      navLinks.forEach((link) => {
        link.classList.toggle('active', link.getAttribute('href') === `#${entry.target.id}`)
      })
    })
  },
  { rootMargin: '-25% 0px -65% 0px' },
)

document.querySelectorAll('main section[id]').forEach((section) => sectionObserver.observe(section))

const installTabs = document.querySelectorAll('[data-install-tab]')
const installPanels = document.querySelectorAll('[data-install-panel]')

installTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.installTab
    installTabs.forEach((item) => item.setAttribute('aria-selected', String(item === tab)))
    installPanels.forEach((panel) => {
      panel.hidden = panel.dataset.installPanel !== target
    })
  })
})

document.querySelectorAll('[data-copy]').forEach((button) => {
  button.addEventListener('click', async () => {
    const originalText = button.textContent
    try {
      await navigator.clipboard.writeText(button.dataset.copy)
      button.textContent = 'Copied'
    } catch {
      button.textContent = 'Select text'
    }
    window.setTimeout(() => {
      button.textContent = originalText
    }, 1800)
  })
})
