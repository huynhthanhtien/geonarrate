import edge_tts


class EdgeTTS:
    async def synthesize(self, text: str, voice_id: str, rate: str = "+0%") -> bytes:
        chunks: list[bytes] = []
        async for chunk in edge_tts.Communicate(text, voice_id, rate=rate).stream():
            if chunk["type"] == "audio":
                chunks.append(chunk["data"])
        return b"".join(chunks)
