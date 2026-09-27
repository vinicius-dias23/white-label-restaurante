import { Contact } from './components/Contact'
import { Footer } from './components/Footer'
import { Gallery } from './components/Gallery'
import { Header } from './components/Header'
import { Hero } from './components/Hero'
import { Hours } from './components/Hours'
import { Services } from './components/Services'
import { Team } from './components/Team'
import { Testimonials } from './components/Testimonials'
import { WhatsAppFab } from './components/WhatsAppFab'

/**
 * A landing page inteira, numa rolagem só. Cada seção decide sozinha se
 * aparece, olhando as feature flags e o conteúdo do config.
 */
export default function App() {
  return (
    <>
      <Header />

      <main>
        <Hero />
        <Services />
        <Gallery />
        <Team />
        <Testimonials />
        <Hours />
        <Contact />
      </main>

      <Footer />
      <WhatsAppFab />
    </>
  )
}
