import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Home from "@/app/page";

describe("Home page", () => {
  it("renders the heading, input, and generate button", () => {
    render(<Home />);
    expect(screen.getByText("Moonbot Tutor")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/chain rule/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate/i })).toBeInTheDocument();
  });
});
