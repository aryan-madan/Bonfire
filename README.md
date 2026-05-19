![Watch parties for you and them](public/assets/banner.png)

# Private peer-to-peer watch parties for two.

## How it works & Web RTC

It runs entirely peer-to-peer using WebRTC. 
Because WebRTC is peer-to-peer, the two browsers must exchange connection details (SDP offers and answers) to find each other. Bonfire achieves this using a Cloudflare Worker.

## Privacy

Signaling is entirely ephemeral, and once the connection is established, all traffic goes directly between the two browsers.
No data is stored anywhere except for your nickname, which you enter at the start, before joining a call.

## Screens

![Join Screen](public/screenshots/join.png)

![Details Screen](public/screenshots/code.png)

![Call Screen](public/screenshots/call.png)

## Experience
Experience Bonfire [here.](https://usebonfire.vercel.app/)

Made with ❤️ by Ary