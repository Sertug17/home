import { HomeExperience } from "./home-experience";

export default function HomePage() {
  // Server geo can later pass a detected country here. Anonymous persisted
  // preference is intentionally resolved inside the client boundary.
  return <HomeExperience detectedCountry={null} />;
}
