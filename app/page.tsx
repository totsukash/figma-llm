"use client";

import { figmaAPI } from "@/lib/figmaAPI";
import { getTextForSelection } from "@/lib/getTextForSelection";
import { getTextOffset } from "@/lib/getTextOffset";
import { CompletionRequestBody } from "@/lib/types";
import { useState } from "react";
import { z } from "zod";

// This function calls our API and lets you read each character as it comes in.
// To change the prompt of our AI, go to `app/api/completion.ts`.
async function streamAIResponse(body: z.infer<typeof CompletionRequestBody>) {
  const resp = await fetch("/api/completion", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const reader = resp.body?.pipeThrough(new TextDecoderStream()).getReader();

  if (!reader) {
    throw new Error("Error reading response");
  }

  return reader;
}

export default function Plugin() {
  const [completion, setCompletion] = useState("");

  // This function calls our API and handles the streaming response.
  // This ends up building the text up and using React state to update the UI.
  const onStreamToIFrame = async () => {
    setCompletion("");
    const layers = await getTextForSelection();

    if (!layers.length) {
      figmaAPI.run(async (figma) => {
        figma.notify(
          "Please select a layer with text in it to generate a poem.",
          { error: true },
        );
      });
      return;
    }

    const reader = await streamAIResponse({
      layers,
    });

    let text = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      text += value;
      setCompletion(text);
    }
  };

  const onStreamToCanvas = async () => {
    let frameID: string | null = null;
    const textPosition = await getTextOffset();

    const createOrUpdateNode = async (content: string) => {
      frameID = await figmaAPI.run(
        async (figma, { frameID, textPosition, content }) => {
          await figma.loadFontAsync({ family: "Inter", style: "Regular" });
          await figma.loadFontAsync({ family: "Inter", style: "Bold" });

          let frame = figma.getNodeById(frameID ?? "") as FrameNode | null;

          if (!frame) {
            frame = figma.createFrame();
            frame.x = textPosition?.x ?? 0;
            frame.y = textPosition?.y ?? 0;
            frame.resize(1200, 800);
            frame.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];

            const header = figma.createText();
            header.fontName = { family: "Inter", style: "Bold" };
            header.characters = "My Website";
            header.fontSize = 24;
            header.x = 20;
            header.y = 20;
            frame.appendChild(header);

            const sidebar = figma.createRectangle();
            sidebar.resize(200, frame.height - 40);
            sidebar.fills = [{ type: "SOLID", color: { r: 0.94, g: 0.94, b: 0.94 } }];
            sidebar.x = 20;
            sidebar.y = 60;
            frame.appendChild(sidebar);

            const contentFrame = figma.createFrame();
            contentFrame.x = 240;
            contentFrame.y = 60;
            contentFrame.resize(frame.width - 260, frame.height - 80);
            frame.appendChild(contentFrame);

            const title = figma.createText();
            title.fontName = { family: "Inter", style: "Bold" };
            title.characters = "Generated by GPT:";
            title.fontSize = 20;
            title.x = 20;
            title.y = 20;
            contentFrame.appendChild(title);

            const paragraph = figma.createText();
            paragraph.fontName = { family: "Inter", style: "Regular" };
            paragraph.characters = content;
            paragraph.fontSize = 16;
            paragraph.x = 20;
            paragraph.y = 60;
            contentFrame.appendChild(paragraph);
          } else {
            const paragraph = frame.findOne(node => node.type === "TEXT" && node.characters.includes("Generated by GPT:")) as TextNode;
            if (paragraph) {
              paragraph.characters = content;
            }
          }

          figma.viewport.scrollAndZoomIntoView([frame]);

          return frame.id;
        },
        { frameID, textPosition, content },
      );
    };

    const reader = await streamAIResponse({
      layers: ["会社のHPを作って"],
    });

    let text = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      text += value;
      await createOrUpdateNode(text);
    }
  };

  return (
    <div className="flex flex-col items-center min-h-screen bg-gray-900 text-white">
      <h1 className="text-4xl font-bold mb-5 mt-2">Poem Generator</h1>
      <div className="text-sm mb-5 text-gray-300">
        ポエムを作成するためのノードを選択してください
      </div>
      <div className="flex flex-row gap-2">
        <button
          onClick={onStreamToIFrame}
          className="mb-5 p-2 px-4 rounded bg-indigo-600 text-white hover:bg-indigo-700"
        >
          ポエムを作成
        </button>
        <button
          onClick={onStreamToCanvas}
          className="mb-5 p-2 px-4 rounded bg-green-600 text-white hover:bg-green-700"
        >
          Figmaに書き出す
        </button>
      </div>
      {completion && (
        <div className="border border-gray-600 rounded p-5 bg-gray-800 shadow-lg m-2 text-gray-200">
          <pre className="whitespace-pre-wrap">
            <p className="text-md">{completion}</p>
          </pre>
        </div>
      )}
    </div>
  );
}
