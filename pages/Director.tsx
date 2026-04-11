import React, { useEffect, useMemo, useState } from "react";
import Admin from "./Admin";
import Manager from "./Manager";
import { db } from "../services/storage";
import { UserProfile } from "../types";
import { Button, Card, Select } from "../components/UI";

export default function DirectorPage({ user }: { user: UserProfile }) {
  const [activeTab, setActiveTab] = useState<"director" | "manager">(
    "director",
  );
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [selectedDept, setSelectedDept] = useState<string>("");

  const departmentOptions = useMemo(
    () =>
      Array.from(
        new Set(
          allUsers
            .map((u) => u.dept)
            .filter((value): value is string => !!value),
        ),
      ),
    [allUsers],
  );

  useEffect(() => {
    setAllUsers(db.getAllUsers());
  }, []);

  useEffect(() => {
    if (!selectedDept && departmentOptions.length > 0) {
      setSelectedDept(departmentOptions[0]);
    }
  }, [departmentOptions, selectedDept]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Button
          variant={activeTab === "director" ? "primary" : "ghost"}
          onClick={() => setActiveTab("director")}
        >
          取締役管理
        </Button>
        <Button
          variant={activeTab === "manager" ? "primary" : "ghost"}
          onClick={() => setActiveTab("manager")}
        >
          部門長管理を見る
        </Button>
      </div>

      {activeTab === "director" ? (
        <Admin mode="director" initialTab="create" />
      ) : (
        <div className="space-y-6">
          <Card
            title="部門を選択"
            sub="取締役として閲覧したい部門を指定してください。"
          >
            <div className="max-w-xs">
              <Select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                options={
                  departmentOptions.length > 0
                    ? departmentOptions.map((dept) => ({
                        value: dept,
                        label: dept,
                      }))
                    : [{ value: "", label: "表示可能な部門がありません" }]
                }
              />
            </div>
          </Card>
          <Manager user={user} overrideDept={selectedDept} />
        </div>
      )}
    </div>
  );
}
