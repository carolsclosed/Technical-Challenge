import { it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "../src/components/ui/button";
it("a disabled submission button cannot submit twice", () => {
  let clicks = 0;
  render(
    <Button disabled onClick={() => clicks++}>
      Place order
    </Button>,
  );
  fireEvent.click(screen.getByRole("button"));
  expect(clicks).toBe(0);
});
