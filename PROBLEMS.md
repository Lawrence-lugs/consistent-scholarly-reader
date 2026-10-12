## Arxiv

### Doubled List

In https://arxiv.org/html/2604.25083, bullets in the "contributions" (after "In summary, the contributions of this paper are:") are doubled and there's a space after it.

It looks like both UL and LI are used to transform these bullets.

```html
<ul id="S1.I1">
<li id="S1.I1.i1"><span class="rd"><span>•</span> 

<p id="S1.I1.i1.p1.1"><span class="rd"><span>Agentic Architect, the first framework for agentic CPU architectural design optimization, built on a modular architecture enabling flexible exploration including evolutionary search methods, interchangeable LLMs, and a range of simulators and hardware components.</span></span></p></span>
</li>
<li id="S1.I1.i2"><span class="rd"><span>•</span> 

<p id="S1.I1.i2.p1.1"><span class="rd"><span>Evolved designs that outperform state-of-the-art across three domains: cache replacement, data prefetching and branch prediction, showcasing the framework’s ability to discover improved designs across both broad and highly constrained search spaces.</span></span></p></span>
</li>
<li id="S1.I1.i3"><span class="rd"><span>•</span> 

<p id="S1.I1.i3.p1.1"><span class="rd"><span>A systematic analysis of the framework’s sensitivity to its key design factors, such as seed selection and evolutionary framework, demonstrating that the human-defined search is the primary factor that defines the evolved design’s quality.</span></span></p></span>
</li>
<li id="S1.I1.i4"><span class="rd"><span>•</span> 

<p id="S1.I1.i4.p1.1"><span class="rd"><span>Open-source release: The Agentic Architect framework will be released as open source following publication.</span></span></p></span>
</li>
</ul>
```

### The figures...

Not only that, but all the figures are missing- preserving the figures was a central feature of our extension.

Here's where a figure should be in the final page:

```html
<figure id="S5.F6">
<figcaption><span class="rd"><span><span>Figure 6.</span></span></span><span> </span><span class="rd"><span>Per-trace IPC over Bimodal for branch prediction policies, including the Hashed Perceptron seed and the evolved design.</span></span></figcaption>
</figure>
```

You can see nothing's there.

Figure 2 in https://arxiv.org/html/2604.25083 was also absolutely butchered- i guess because it's parseable text but it's actually a figure. This might be forgivable for now, but let's document this behavior.

### Disappearing Equations

https://arxiv.org/html/2610.13206v1's equations disappear. 

[Extension result outerhtml is here](reference/arxiv-disappearing-equations.html). You can get the page from arxiv because it's open access anyway.

## IEEExplore

For https://ieeexplore.ieee.org/document/10040932, everything except the title disappears. I've placed the actual outerHTML from root in [reference/ieee-page.html](reference/ieee-page.html).

## Nature

https://www.nature.com/articles/s41593-026-02464-0 parses basically correctly:

- Figures appear
- Paragraphs are correct

except the following points:

- The inline "similar content being viewed by others" and "explore related subjects" non-focused content is also parsed. Doesn't look like an easy fix so I'd say just document this.
- Numbered list in this article also turns into a doubled bullet list like in the arxiv problem above
- Citation hover doesn't work, but the citations are clearly in the nature page.

[Original outer html here](reference/nature-citations-bad.html)