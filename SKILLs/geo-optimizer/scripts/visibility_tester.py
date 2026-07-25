#!/usr/bin/env python3
"""GEO Visibility Tester - Test brand visibility in AI search engines.

Supports four backends:
  --engine perplexity  : Perplexity API (sonar-pro, single-call)
  --engine kimi        : Kimi API with built-in $web_search (multi-turn tool_calls)
  --engine doubao      : 豆包/火山引擎 API with web_search tool (Responses API)
  --engine custom      : Any OpenAI-compatible API with tool-calling web search
"""

import argparse
import json
import os
import sys
from datetime import datetime

try:
    import requests
except ImportError:
    requests = None

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None

def _build_prompt(keyword, query_template):
    if query_template:
        return query_template.format(keyword=keyword)
    return f"推荐{keyword}工具。告诉我你推荐了哪些工具，分别说为什么。"

def test_perplexity(brand, keyword, api_key, query_template=None):
    if requests is None:
        return {"error": "requests library not installed. Run: pip install requests"}

    prompt = _build_prompt(keyword, query_template)
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {
        "model": "sonar-pro",
        "messages": [{"role": "user", "content": prompt}],
    }

    try:
        resp = requests.post(
            "https://api.perplexity.ai/chat/completions",
            headers=headers, json=payload, timeout=60,
        )
        resp.raise_for_status()
        response_text = resp.json()["choices"][0]["message"]["content"]
        mentioned = brand.lower() in response_text.lower()
        return {
            "date": datetime.now().isoformat(),
            "engine": "Perplexity",
            "keyword": keyword,
            "brand": brand,
            "cited": mentioned,
            "context": response_text[:500] if mentioned else "Not cited",
            "full_response_length": len(response_text),
        }
    except requests.exceptions.HTTPError as e:
        return {"error": f"HTTP error: {e}", "keyword": keyword}
    except Exception as e:
        return {"error": str(e), "keyword": keyword}

def test_kimi(brand, keyword, api_key, model="kimi-k2.6", base_url="https://api.moonshot.cn/v1",
              query_template=None):
    if OpenAI is None:
        return {"error": "openai library not installed. Run: pip install openai"}

    prompt = _build_prompt(keyword, query_template)
    client = OpenAI(base_url=base_url, api_key=api_key)

    messages = [
        {"role": "system", "content": "你是一个客观的产品推荐助手，请基于联网搜索结果回答问题，列出你找到的所有相关工具和品牌。"},
        {"role": "user", "content": prompt},
    ]

    tools = [{"type": "builtin_function", "function": {"name": "$web_search"}}]

    try:
        finish_reason = None
        while finish_reason is None or finish_reason == "tool_calls":
            completion = client.chat.completions.create(
                model=model,
                messages=messages,
                max_tokens=8192,
                tools=tools,
                extra_body={"thinking": {"type": "disabled"}},
            )
            choice = completion.choices[0]
            finish_reason = choice.finish_reason

            if finish_reason == "tool_calls":
                messages.append({
                    "role": "assistant",
                    "content": choice.message.content,
                    "tool_calls": choice.message.tool_calls,
                })
                for tc in choice.message.tool_calls:
                    tc_args = json.loads(tc.function.arguments)
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "name": tc.function.name,
                        "content": json.dumps(tc_args, ensure_ascii=False),
                    })

        response_text = choice.message.content or ""
        mentioned = brand.lower() in response_text.lower()
        return {
            "date": datetime.now().isoformat(),
            "engine": "Kimi",
            "keyword": keyword,
            "brand": brand,
            "cited": mentioned,
            "context": response_text[:500] if mentioned else "Not cited",
            "full_response_length": len(response_text),
        }
    except Exception as e:
        return {"error": str(e), "keyword": keyword}

def test_doubao(brand, keyword, api_key, model="doubao-seed-2-0-pro-260215",
                base_url="https://ark.cn-beijing.volces.com/api/v3/responses",
                query_template=None):
    """Test brand visibility via 豆包 (火山引擎) Responses API with web_search tool."""
    if requests is None:
        return {"error": "requests library not installed. Run: pip install requests"}

    prompt = _build_prompt(keyword, query_template)

    payload = {
        "model": model,
        "tools": [{"type": "web_search"}],
        "temperature": 0.6,
        "max_output_tokens": 4096,
        "input": [
            {
                "role": "system",
                "content": [{"type": "input_text", "text": "你是一个客观的产品推荐助手，请基于联网搜索结果回答问题，列出你找到的所有相关工具和品牌。"}],
            },
            {
                "role": "user",
                "content": [{"type": "input_text", "text": prompt}],
            },
        ],
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        resp = requests.post(base_url, headers=headers, json=payload, timeout=120)
        resp.raise_for_status()
        data = resp.json()

        # Extract text from Responses API output format
        response_text = ""
        output = data.get("output", [])
        for item in output:
            if item.get("type") == "message" and item.get("role") == "assistant":
                content = item.get("content", [])
                for block in content:
                    if block.get("type") == "output_text":
                        response_text += block.get("text", "")

        mentioned = brand.lower() in response_text.lower()
        return {
            "date": datetime.now().isoformat(),
            "engine": "Doubao",
            "keyword": keyword,
            "brand": brand,
            "cited": mentioned,
            "context": response_text[:500] if mentioned else "Not cited",
            "full_response_length": len(response_text),
        }
    except requests.exceptions.HTTPError as e:
        return {"error": f"HTTP error: {e}", "keyword": keyword}
    except Exception as e:
        return {"error": str(e), "keyword": keyword}


def test_custom(brand, keyword, api_key, model="gpt-4o",
                base_url="https://api.openai.com/v1",
                query_template=None,
                web_search_tool_name="web_search",
                web_search_tool_params=None):
    """Test brand visibility via any OpenAI-compatible API with web search tool calling.

    Supports any LLM provider whose API:
    - Uses OpenAI-compatible /v1/chat/completions endpoint
    - Has a built-in web search tool via function calling

    Defaults to OpenAI-compatible format. Override --web-search-tool-name and
    --web-search-tool-params for provider-specific tool definitions.
    """
    if OpenAI is None:
        return {"error": "openai library not installed. Run: pip install openai"}

    prompt = _build_prompt(keyword, query_template)

    # Build web search tool definition
    if web_search_tool_params:
        try:
            tool_def = json.loads(web_search_tool_params)
        except json.JSONDecodeError:
            return {"error": f"Invalid JSON in --web-search-tool-params: {web_search_tool_params}"}
    else:
        # Default: simple function-call style web search
        tool_def = {
            "type": "function",
            "function": {
                "name": web_search_tool_name,
                "description": "Search the web for real-time information",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "The search query",
                        }
                    },
                    "required": ["query"],
                },
            },
        }

    try:
        client = OpenAI(base_url=base_url, api_key=api_key)

        messages = [
            {"role": "system", "content": "你是一个客观的产品推荐助手，请基于联网搜索结果回答问题，列出你找到的所有相关工具和品牌。"},
            {"role": "user", "content": prompt},
        ]
        tools = [tool_def]

        finish_reason = None
        max_turns = 5
        turns = 0
        while finish_reason is None or finish_reason == "tool_calls":
            turns += 1
            if turns > max_turns:
                return {"error": "Too many tool-call turns", "keyword": keyword}

            completion = client.chat.completions.create(
                model=model,
                messages=messages,
                max_tokens=4096,
                tools=tools,
            )
            choice = completion.choices[0]
            finish_reason = choice.finish_reason

            if finish_reason == "tool_calls":
                messages.append({
                    "role": "assistant",
                    "content": choice.message.content,
                    "tool_calls": choice.message.tool_calls,
                })
                for tc in choice.message.tool_calls:
                    tc_args = json.loads(tc.function.arguments)
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "name": tc.function.name,
                        "content": json.dumps(tc_args, ensure_ascii=False),
                    })

        response_text = choice.message.content or ""
        mentioned = brand.lower() in response_text.lower()
        return {
            "date": datetime.now().isoformat(),
            "engine": "Custom",
            "keyword": keyword,
            "brand": brand,
            "cited": mentioned,
            "context": response_text[:500] if mentioned else "Not cited",
            "full_response_length": len(response_text),
        }
    except Exception as e:
        return {"error": str(e), "keyword": keyword}


def save_history(result, history_file):
    history = []
    if os.path.exists(history_file):
        with open(history_file, encoding="utf-8") as f:
            history = json.load(f)
    history.append(result)
    with open(history_file, "w", encoding="utf-8") as f:
        json.dump(history, f, indent=2, ensure_ascii=False)
    return history

ENGINES = {
    "perplexity": {"func": test_perplexity, "extra_args": []},
    "kimi": {
        "func": test_kimi,
        "extra_args": ["model", "base_url"],
    },
    "doubao": {
        "func": test_doubao,
        "extra_args": ["model", "base_url"],
    },
    "custom": {
        "func": test_custom,
        "extra_args": ["model", "base_url", "web_search_tool_name", "web_search_tool_params"],
    },
}

def main():
    parser = argparse.ArgumentParser(description="GEO Visibility Tester")
    parser.add_argument("--brand", required=True, help="Brand name to test")
    parser.add_argument("--keywords", nargs="+", required=True, help="Keywords to search")
    parser.add_argument("--engine", default="kimi", choices=["perplexity", "kimi", "doubao", "custom"],
                        help="Search engine backend (default: kimi)")
    parser.add_argument("--api-key", help="API key (or set ENGINE_API_KEY env var)")
    parser.add_argument("--model", default="kimi-k2.6", help="Model name")
    parser.add_argument("--base-url", default="https://api.moonshot.cn/v1",
                        help="API base URL")
    parser.add_argument("--web-search-tool-name", default="web_search",
                        help="Tool/function name for web search (custom engine only)")
    parser.add_argument("--web-search-tool-params",
                        help="JSON string of tool definition params (custom engine only)")
    parser.add_argument("--query", help="Custom query template (use {keyword} placeholder)")
    parser.add_argument("--history", default="visibility_history.json", help="History file path")
    parser.add_argument("--no-save", action="store_true", help="Don't save to history")
    args = parser.parse_args()

    # Resolve API key: CLI arg > env var
    api_key = args.api_key
    if not api_key:
        env_map = {
            "perplexity": "PERPLEXITY_API_KEY",
            "kimi": "KIMI_API_KEY",
            "doubao": "ARK_API_KEY",
            "custom": "CUSTOM_API_KEY",
        }
        api_key = os.environ.get(env_map[args.engine])
    if not api_key:
        print(f"Error: --api-key required or set {env_map[args.engine]} env var", file=sys.stderr)
        sys.exit(1)

    engine_conf = ENGINES[args.engine]
    test_func = engine_conf["func"]

    all_results = []
    for kw in args.keywords:
        print(f"Testing [{args.engine}]: {kw} ...", file=sys.stderr)

        kwargs = {"brand": args.brand, "keyword": kw, "api_key": api_key, "query_template": args.query}
        if args.engine in ("kimi", "doubao", "custom"):
            kwargs["model"] = args.model
            kwargs["base_url"] = args.base_url
        if args.engine == "custom":
            kwargs["web_search_tool_name"] = args.web_search_tool_name
            if args.web_search_tool_params:
                kwargs["web_search_tool_params"] = args.web_search_tool_params

        result = test_func(**kwargs)

        if "error" in result:
            print(f"  Error: {result['error']}", file=sys.stderr)
        else:
            status = "CITED" if result["cited"] else "NOT CITED"
            print(f"  {status}", file=sys.stderr)
        all_results.append(result)

        if not args.no_save and "error" not in result:
            save_history(result, args.history)

    print(json.dumps(all_results, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()
