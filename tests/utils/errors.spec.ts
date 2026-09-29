import { formatError } from "../../src/utils/errors";

describe("errors", () => {
    test.each`
        error                                                      | expected
        ${"test"}                                                  | ${"test"}
        ${21}                                                      | ${"21"}
        ${{ toString: () => "message" }}                           | ${"message"}
        ${{ some: "data" }}                                        | ${'{"some":"data"}'}
        ${{ message: "data" }}                                     | ${"data"}
        ${{ error: "more data" }}                                  | ${"more data"}
        ${{ error: { message: "nested" } }}                        | ${"nested"}
        ${{ data: "from data" }}                                   | ${"from data"}
        ${new Error("error instance")}                             | ${"error instance"}
        ${{ error: { message: "nested wins" }, message: "outer" }} | ${"nested wins"}
    `("should format error to readable string", ({ error, expected }) => {
        expect(formatError(error)).toEqual(expected);
    });
});
