import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const siteRoot = resolve(root, 'docs')
const htmlPath = resolve(siteRoot, 'index.html')
const html = readFileSync(htmlPath, 'utf8')
const document = new JSDOM(html).window.document
const problems = []
const canonicalUrl = 'https://b0yblake.github.io/Git-Deck/'

const ids = [...document.querySelectorAll('[id]')].map((element) => element.id)
const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))]
if (duplicateIds.length) problems.push(`Duplicate IDs: ${duplicateIds.join(', ')}`)

for (const anchor of document.querySelectorAll('a[href^="#"]')) {
  const id = anchor.getAttribute('href').slice(1)
  if (id && !document.getElementById(id)) problems.push(`Missing anchor target: #${id}`)
}

for (const image of document.querySelectorAll('img')) {
  if (!image.hasAttribute('alt')) problems.push(`Image is missing alt text: ${image.src}`)
  if (!image.hasAttribute('width') || !image.hasAttribute('height')) {
    problems.push(`Image is missing intrinsic dimensions: ${image.src}`)
  }

  const source = image.getAttribute('src')
  if (source?.startsWith('./') && source.endsWith('.png')) {
    const imagePath = resolve(siteRoot, source.slice(2))
    const bytes = readFileSync(imagePath)
    const actualWidth = bytes.readUInt32BE(16)
    const actualHeight = bytes.readUInt32BE(20)
    if (Number(image.getAttribute('width')) !== actualWidth || Number(image.getAttribute('height')) !== actualHeight) {
      problems.push(
        `Incorrect intrinsic dimensions for ${source}: expected ${actualWidth}×${actualHeight}`,
      )
    }
  }
}

for (const button of document.querySelectorAll('button')) {
  if (!button.hasAttribute('type')) problems.push(`Button is missing type: ${button.textContent.trim()}`)
}

const localReferences = [
  ...document.querySelectorAll('link[href], script[src], img[src]'),
].map((element) => element.getAttribute('href') ?? element.getAttribute('src'))

for (const reference of localReferences) {
  if (!reference.startsWith('./')) continue
  const localPath = resolve(siteRoot, reference.slice(2))
  if (!existsSync(localPath)) problems.push(`Missing local asset: ${reference}`)
}

for (const sectionId of ['features', 'product-tour', 'workflow', 'privacy', 'install']) {
  if (!document.getElementById(sectionId)) problems.push(`Missing required section: #${sectionId}`)
}

const description = document.querySelector('meta[name="description"]')?.content.trim()
if (!description) problems.push('Missing meta description')
if (description && (description.length < 120 || description.length > 170)) {
  problems.push(`Meta description should be 120–170 characters; received ${description.length}`)
}

const title = document.querySelector('title')?.textContent.trim()
if (!title) problems.push('Missing document title')
if (title && (title.length < 30 || title.length > 60)) {
  problems.push(`Document title should be 30–60 characters; received ${title.length}`)
}

if (document.documentElement.lang !== 'en') problems.push('Document language must be en')
if (document.querySelectorAll('h1').length !== 1) problems.push('Landing page must contain exactly one H1')

const canonical = document.querySelector('link[rel="canonical"]')?.href
if (canonical !== canonicalUrl) problems.push('Canonical URL is missing or incorrect')

const robotsMeta = document.querySelector('meta[name="robots"]')?.content.toLowerCase()
if (!robotsMeta?.includes('index') || !robotsMeta?.includes('follow')) {
  problems.push('Robots meta must allow indexing and following links')
}

const socialImage = document.querySelector('meta[property="og:image"]')?.content
if (!socialImage?.startsWith('https://')) problems.push('Open Graph image must use an absolute HTTPS URL')

const structuredDataNodes = [...document.querySelectorAll('script[type="application/ld+json"]')]
if (!structuredDataNodes.length) problems.push('Missing JSON-LD structured data')
const structuredTypes = structuredDataNodes.flatMap((node) => {
  const data = JSON.parse(node.textContent)
  const entries = data['@graph'] ?? [data]
  return entries.map((entry) => entry['@type'])
})
for (const type of ['WebSite', 'SoftwareApplication', 'FAQPage']) {
  if (!structuredTypes.includes(type)) problems.push(`Missing ${type} structured data`)
}

const robotsPath = resolve(siteRoot, 'robots.txt')
const sitemapPath = resolve(siteRoot, 'sitemap.xml')
const manifestPath = resolve(siteRoot, 'site.webmanifest')
for (const requiredFile of [robotsPath, sitemapPath, manifestPath]) {
  if (!existsSync(requiredFile)) problems.push(`Missing SEO file: ${requiredFile}`)
}

const robots = readFileSync(robotsPath, 'utf8')
if (!robots.includes(`${canonicalUrl}sitemap.xml`)) problems.push('robots.txt must reference sitemap.xml')

const sitemap = readFileSync(sitemapPath, 'utf8')
if (!sitemap.includes(`<loc>${canonicalUrl}</loc>`)) problems.push('sitemap.xml must contain the canonical URL')
const sitemapDocument = new JSDOM(sitemap, { contentType: 'application/xml' }).window.document
if (sitemapDocument.querySelector('parsererror')) problems.push('sitemap.xml is not valid XML')

JSON.parse(readFileSync(manifestPath, 'utf8'))

for (const script of document.querySelectorAll('script[src^="./"]')) {
  const scriptPath = resolve(siteRoot, script.getAttribute('src').slice(2))
  new Function(readFileSync(scriptPath, 'utf8'))
}

const css = readFileSync(resolve(siteRoot, 'styles.css'), 'utf8')
const openingBraces = (css.match(/{/g) ?? []).length
const closingBraces = (css.match(/}/g) ?? []).length
if (openingBraces !== closingBraces) problems.push('CSS braces are unbalanced')

if (problems.length) {
  console.error(problems.map((problem) => `- ${problem}`).join('\n'))
  process.exit(1)
}

console.log(`Landing page check passed: ${ids.length} IDs, ${localReferences.length} local references validated.`)
