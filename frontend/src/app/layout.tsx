import type {Metadata} from "next";
import "leaflet/dist/leaflet.css";
import "./globals.css";
export const metadata: Metadata={title:"SmartRoute",description:"Search places and plan routes in Phnom Penh"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
